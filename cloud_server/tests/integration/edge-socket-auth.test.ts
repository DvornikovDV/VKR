import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { lastSeenRegistry } from '../../src/services/edge-servers.service';
import {
    getPendingCommandCount,
    registerPendingCommand,
    resetPendingCommandRegistryForTests,
} from '../../src/services/command-pending-registry';
import { getConnectedEdgeSocketCount } from '../../src/socket/io';
import { getActiveTrustedEdgeSocket } from '../../src/socket/events/edge';
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
        resetPendingCommandRegistryForTests();
    });

    afterEach(async () => {
        await cleanupClientSockets(activeSockets);
        resetPendingCommandRegistryForTests();
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

        const onlineStatusPromise = waitForEvent<{ edgeId: string; online: boolean; lastSeenAt: string | null }>(
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

        await expect(onlineStatusPromise).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                online: true,
                lastSeenAt: expect.any(String),
            }),
        );

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

    it('rejects removed legacy auth payload shape on the real /edge socket path', async () => {
        const { adminToken } = await createAdminSession('edge_socket_auth_legacy_admin@test.com');
        const registered = await registerEdge(adminToken, 'Legacy Auth Shape Rejected');

        const connectError = await connectEdgeExpectingError(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialMode: 'onboarding',
            credentialSecret: registered.credentialSecret,
        });

        expect(connectError).toBe('invalid_credential');
        expect(getConnectedEdgeSocketCount(registered.edgeId)).toBe(0);
    });

    it('classifies malformed edgeId in handshake as invalid_credential', async () => {
        const malformedIdError = await connectEdgeExpectingError(socketBaseUrl, activeSockets, {
            edgeId: 'not-an-object-id',
            credentialSecret: 'any-secret',
        });

        expect(malformedIdError).toBe('invalid_credential');
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

        const initialOnlineStatus = waitForEvent<{ edgeId: string; online: boolean; lastSeenAt: string | null }>(
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

        await expect(initialOnlineStatus).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                online: true,
                lastSeenAt: expect.any(String),
            }),
        );
        await expect(initialTelemetry).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [expect.objectContaining({ metric: 'running', last: true })],
            }),
        );

        const forcedDisconnect = waitForForcedDisconnect(edgeSocket);
        const offlineStatus = waitForEvent<{ edgeId: string; online: boolean; lastSeenAt: string | null }>(
            dashboardSocket,
            'edge_status',
        );

        await expect(blockEdge(adminToken, registered.edgeId)).resolves.toBeUndefined();
        await expect(forcedDisconnect).resolves.toEqual({
            edgeReason: 'blocked',
            disconnectReason: 'io server disconnect',
        });
        await expect(offlineStatus).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                online: false,
                lastSeenAt: expect.any(String),
            }),
        );

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

    it('rejects a second edge runtime connect for the same edgeId while a trusted session is active', async () => {
        const { adminToken } = await createAdminSession('edge_socket_single_session_admin@test.com');
        const registered = await registerEdge(adminToken, 'Single Session Edge');

        const firstSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });

        expect(firstSocket.connected).toBe(true);
        expect(getConnectedEdgeSocketCount(registered.edgeId)).toBe(1);

        const secondError = await connectEdgeExpectingError(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });

        expect(secondError).toBe('invalid_credential');
        expect(getConnectedEdgeSocketCount(registered.edgeId)).toBe(1);
        expect(firstSocket.connected).toBe(true);
    });

    it('routes command_result from the real trusted /edge path into the pending registry', async () => {
        const { adminToken } = await createAdminSession('edge_socket_command_admin@test.com');
        const firstEdge = await registerEdge(adminToken, 'Command Result Edge');
        const secondEdge = await registerEdge(adminToken, 'Command Result Other Edge');

        const secondEdgeSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: secondEdge.edgeId,
            credentialSecret: secondEdge.credentialSecret,
        });

        const requestId = 'request-real-edge-path';
        const pending = registerPendingCommand({
            edgeId: firstEdge.edgeId,
            requestId,
            timeoutMs: 1000,
        });

        secondEdgeSocket.emit('command_result', {
            edgeId: firstEdge.edgeId,
            requestId,
            status: 'confirmed',
            completedAt: '2026-05-03T00:00:00.000Z',
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(getPendingCommandCount()).toBe(1);

        const firstEdgeSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: firstEdge.edgeId,
            credentialSecret: firstEdge.credentialSecret,
        });
        const activeTrustedSocket = getActiveTrustedEdgeSocket(firstEdge.edgeId);
        expect(activeTrustedSocket?.data['edgeId']).toBe(firstEdge.edgeId);

        firstEdgeSocket.emit('command_result', {
            edgeId: firstEdge.edgeId,
            requestId,
            status: 'confirmed',
            completedAt: '2026-05-03T00:00:01.000Z',
        });

        await expect(pending.promise).resolves.toEqual({
            kind: 'result',
            result: {
                requestId,
                status: 'confirmed',
                completedAt: '2026-05-03T00:00:01.000Z',
            },
        });
        expect(getPendingCommandCount()).toBe(0);

        firstEdgeSocket.emit('command_result', {
            edgeId: firstEdge.edgeId,
            requestId,
            status: 'failed',
            failureReason: 'edge_command_failed',
            completedAt: '2026-05-03T00:00:02.000Z',
        });
        expect(getPendingCommandCount()).toBe(0);
    });
});
