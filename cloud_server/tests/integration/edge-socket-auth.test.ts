import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { lastSeenRegistry } from '../../src/services/edge-servers.service';
import { getConnectedEdgeSocketCount } from '../../src/socket/io';
import type { TelemetryBroadcast } from '../../src/socket/events/telemetry';
import {
    bindEdgeToUser,
    blockEdge,
    cleanupClientSockets,
    connectDashboardSocket,
    connectEdgeExpectingError,
    connectEdgeSocket,
    createAdminSession,
    createUserSession,
    ensureServerListening,
    expectNoEvent,
    registerEdge,
    stopServerIfStarted,
    waitForEvent,
    waitForForcedDisconnect,
} from './edge-socket.helpers';

describe('Edge socket auth runtime path', () => {
    let socketBaseUrl = '';
    let startedSocketServer = false;
    const activeSockets = new Set<import('socket.io-client').Socket>();

    beforeAll(async () => {
        await connectDatabase();
        const listening = await ensureServerListening();
        socketBaseUrl = listening.socketBaseUrl;
        startedSocketServer = listening.startedSocketServer;
    });

    afterAll(async () => {
        await cleanupClientSockets(activeSockets);
        await EdgeServer.deleteMany({});
        await User.deleteMany({});
        await stopServerIfStarted(startedSocketServer);
        await disconnectDatabase();
    });

    beforeEach(async () => {
        await cleanupClientSockets(activeSockets);
        await EdgeServer.deleteMany({});
        await User.deleteMany({});
        lastSeenRegistry.clear();
    });

    afterEach(async () => {
        await cleanupClientSockets(activeSockets);
    });

    it('accepts /edge connect only with the current persistent credential and never emits edge_activation', async () => {
        const { adminToken } = await createAdminSession('edge_socket_auth_admin@test.com');
        const { userId, userToken } = await createUserSession('edge_socket_auth_user@test.com');
        const registered = await registerEdge(adminToken, 'Edge Socket Auth');
        await bindEdgeToUser(adminToken, registered.edgeId, userId);

        const dashboardSocket = await connectDashboardSocket(
            socketBaseUrl,
            activeSockets,
            userToken,
            registered.edgeId,
        );

        const edgeSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });

        expect(getConnectedEdgeSocketCount(registered.edgeId)).toBe(1);
        await expectNoEvent(edgeSocket, 'edge_activation');

        const persistedAfterConnect = await EdgeServer.findById(registered.edgeId)
            .select('availability persistentCredential.lastAcceptedAt')
            .lean<{ availability: { online: boolean }; persistentCredential?: { lastAcceptedAt: Date | null } } | null>()
            .exec();

        expect(persistedAfterConnect?.availability.online).toBe(false);
        expect(persistedAfterConnect?.persistentCredential?.lastAcceptedAt).toBeInstanceOf(Date);

        const onlineStatusPromise = waitForEvent<{ edgeId: string; online: boolean }>(
            dashboardSocket,
            'edge_status',
        );
        const telemetryPromise = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');

        edgeSocket.emit('telemetry', {
            readings: [
                {
                    deviceId: 'pump-01',
                    metric: 'pressure',
                    value: 3.14,
                    ts: Date.now(),
                },
            ],
        });

        await expect(onlineStatusPromise).resolves.toEqual({
            edgeId: registered.edgeId,
            online: true,
        });

        await expect(telemetryPromise).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [
                    expect.objectContaining({
                        deviceId: 'pump-01',
                        metric: 'pressure',
                        last: 3.14,
                    }),
                ],
            }),
        );
    });

    it('rejects onboarding-style auth payload on the real /edge socket path', async () => {
        const { adminToken } = await createAdminSession('edge_socket_auth_legacy_admin@test.com');
        const registered = await registerEdge(adminToken, 'Legacy Onboarding Rejected');

        const connectError = await connectEdgeExpectingError(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialMode: 'onboarding',
            credentialSecret: registered.credentialSecret,
        });

        expect(connectError).toBe('invalid_credential');
        expect(getConnectedEdgeSocketCount(registered.edgeId)).toBe(0);
    });

    it('forces disconnect through the production socket path and stops trusted telemetry from the disconnected runtime', async () => {
        const { adminToken } = await createAdminSession('edge_socket_auth_disconnect_admin@test.com');
        const { userId, userToken } = await createUserSession('edge_socket_auth_disconnect_user@test.com');
        const registered = await registerEdge(adminToken, 'Forced Disconnect Auth Proof');
        await bindEdgeToUser(adminToken, registered.edgeId, userId);

        const dashboardSocket = await connectDashboardSocket(
            socketBaseUrl,
            activeSockets,
            userToken,
            registered.edgeId,
        );
        const edgeSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });

        const initialOnlineStatus = waitForEvent<{ edgeId: string; online: boolean }>(
            dashboardSocket,
            'edge_status',
        );
        const initialTelemetry = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');
        edgeSocket.emit('telemetry', {
            readings: [
                {
                    deviceId: 'pump-01',
                    metric: 'running',
                    value: true,
                    ts: Date.now(),
                },
            ],
        });

        await expect(initialOnlineStatus).resolves.toEqual({
            edgeId: registered.edgeId,
            online: true,
        });
        await expect(initialTelemetry).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [expect.objectContaining({ metric: 'running', last: true })],
            }),
        );

        const forcedDisconnect = waitForForcedDisconnect(edgeSocket);
        const offlineStatus = waitForEvent<{ edgeId: string; online: boolean }>(
            dashboardSocket,
            'edge_status',
        );

        await expect(blockEdge(adminToken, registered.edgeId)).resolves.toBeUndefined();
        await expect(forcedDisconnect).resolves.toEqual({
            edgeReason: 'blocked',
            disconnectReason: 'io server disconnect',
        });
        await expect(offlineStatus).resolves.toEqual({
            edgeId: registered.edgeId,
            online: false,
        });

        expect(getConnectedEdgeSocketCount(registered.edgeId)).toBe(0);

        edgeSocket.emit('telemetry', {
            readings: [
                {
                    deviceId: 'pump-01',
                    metric: 'running',
                    value: false,
                    ts: Date.now(),
                },
            ],
        });

        await expect(expectNoEvent(dashboardSocket, 'telemetry')).resolves.toBeUndefined();
    });
});
