import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { lastSeenRegistry } from '../../src/services/edge-servers.service';
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
    rotateEdgeCredential,
    stopServerIfStarted,
    unblockEdge,
    waitForEvent,
    waitForForcedDisconnect,
} from './edge-socket.helpers';

describe('Edge socket lifecycle runtime path', () => {
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

    it('forces disconnect on rotate, rejects the old credential, and restores trusted reconnect only with the new credential', async () => {
        const { adminToken } = await createAdminSession('edge_socket_rotate_admin@test.com');
        const { userId, userToken } = await createUserSession('edge_socket_rotate_user@test.com');
        const registered = await registerEdge(adminToken, 'Rotate Edge Runtime');
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
                { deviceId: 'sensor-01', metric: 'temperature', value: 21.5, ts: Date.now() },
            ],
        });

        await expect(initialOnlineStatus).resolves.toEqual({
            edgeId: registered.edgeId,
            online: true,
        });
        await expect(initialTelemetry).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [expect.objectContaining({ metric: 'temperature', last: 21.5 })],
            }),
        );

        const forcedDisconnect = waitForForcedDisconnect(edgeSocket);
        const offlineStatus = waitForEvent<{ edgeId: string; online: boolean }>(
            dashboardSocket,
            'edge_status',
        );
        const rotated = await rotateEdgeCredential(adminToken, registered.edgeId);

        await expect(forcedDisconnect).resolves.toEqual({
            edgeReason: 'credential_rotated',
            disconnectReason: 'io server disconnect',
        });
        await expect(offlineStatus).resolves.toEqual({
            edgeId: registered.edgeId,
            online: false,
        });

        edgeSocket.emit('telemetry', {
            readings: [
                { deviceId: 'sensor-01', metric: 'temperature', value: 22.5, ts: Date.now() },
            ],
        });
        await expect(expectNoEvent(dashboardSocket, 'telemetry')).resolves.toBeUndefined();

        const oldCredentialError = await connectEdgeExpectingError(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });

        expect(oldCredentialError).toBe('invalid_credential');

        const reconnectedSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: rotated.credentialSecret,
        });

        const restoredOnlineStatus = waitForEvent<{ edgeId: string; online: boolean }>(
            dashboardSocket,
            'edge_status',
        );
        const restoredTelemetry = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');
        reconnectedSocket.emit('telemetry', {
            readings: [
                { deviceId: 'sensor-01', metric: 'temperature', value: 23.5, ts: Date.now() },
            ],
        });

        await expect(restoredOnlineStatus).resolves.toEqual({
            edgeId: registered.edgeId,
            online: true,
        });
        await expect(restoredTelemetry).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [expect.objectContaining({ metric: 'temperature', last: 23.5 })],
            }),
        );
    });

    it('forces disconnect on block, stops trusted telemetry, and allows reconnect only with the current post-unblock credential', async () => {
        const { adminToken } = await createAdminSession('edge_socket_block_admin@test.com');
        const { userId, userToken } = await createUserSession('edge_socket_block_user@test.com');
        const registered = await registerEdge(adminToken, 'Block Edge Runtime');
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
                { deviceId: 'motor-01', metric: 'running', value: true, ts: Date.now() },
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
        await blockEdge(adminToken, registered.edgeId);

        await expect(forcedDisconnect).resolves.toEqual({
            edgeReason: 'blocked',
            disconnectReason: 'io server disconnect',
        });
        await expect(offlineStatus).resolves.toEqual({
            edgeId: registered.edgeId,
            online: false,
        });

        edgeSocket.emit('telemetry', {
            readings: [
                { deviceId: 'motor-01', metric: 'running', value: false, ts: Date.now() },
            ],
        });
        await expect(expectNoEvent(dashboardSocket, 'telemetry')).resolves.toBeUndefined();

        const blockedReconnectError = await connectEdgeExpectingError(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });
        expect(blockedReconnectError).toBe('blocked');

        const unblocked = await unblockEdge(adminToken, registered.edgeId);

        const oldCredentialError = await connectEdgeExpectingError(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });
        expect(oldCredentialError).toBe('invalid_credential');

        const reconnectedSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: unblocked.credentialSecret,
        });

        const restoredOnlineStatus = waitForEvent<{ edgeId: string; online: boolean }>(
            dashboardSocket,
            'edge_status',
        );
        const restoredTelemetry = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');
        reconnectedSocket.emit('telemetry', {
            readings: [
                { deviceId: 'motor-01', metric: 'running', value: false, ts: Date.now() },
            ],
        });

        await expect(restoredOnlineStatus).resolves.toEqual({
            edgeId: registered.edgeId,
            online: true,
        });
        await expect(restoredTelemetry).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [expect.objectContaining({ metric: 'running', last: false })],
            }),
        );
    });
});
