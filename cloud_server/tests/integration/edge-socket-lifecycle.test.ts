import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { AlarmIncident } from '../../src/models/AlarmIncident';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import * as edgeServersService from '../../src/services/edge-servers.service';
import { lastSeenRegistry } from '../../src/services/edge-servers.service';
import type { TelemetryBroadcast } from '../../src/socket/events/telemetry';
import {
    bindEdgeToUser,
    blockEdge,
    closeSocket,
    cleanupClientSockets,
    connectDashboardSocket,
    connectEdgeExpectingError,
    connectEdgeSocket,
    createAdminSession,
    createUserSession,
    ensureServerListening,
    expectNoEvent,
    countConnectivityAlarmIncidents,
    findConnectivityAlarmIncidents,
    registerEdge,
    rotateEdgeCredential,
    stopServerIfStarted,
    unblockEdge,
    waitForAlarmIncidentChanged,
    waitForEdgeStatus,
    waitForEvent,
    waitForForcedDisconnect,
    type AlarmIncidentChangedPayload,
    type EdgeStatusPayload,
} from './edge-socket.helpers';

function expectOfflineEdgeStatus(payload: EdgeStatusPayload, edgeId: string): void {
    expect(payload).toEqual(
        expect.objectContaining({
            edgeId,
            online: false,
        }),
    );
    expect(payload).toHaveProperty('lastSeenAt');
    expect(typeof payload.lastSeenAt === 'string' || payload.lastSeenAt === null).toBe(true);
}

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
        await AlarmIncident.deleteMany({});
        await EdgeServer.deleteMany({});
        await User.deleteMany({});
        await stopServerIfStarted(startedSocketServer);
        await disconnectDatabase();
    });

    beforeEach(async () => {
        await cleanupClientSockets(activeSockets);
        await AlarmIncident.deleteMany({});
        await EdgeServer.deleteMany({});
        await User.deleteMany({});
        lastSeenRegistry.clear();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await cleanupClientSockets(activeSockets);
    });

    it('activates connectivity on ordinary offline, clears on reconnect, and ignores stale offline continuation after fast reconnect', async () => {
        const { adminToken } = await createAdminSession('edge_socket_connectivity_admin@test.com');
        const { userId, userToken } = await createUserSession('edge_socket_connectivity_user@test.com');
        const registered = await registerEdge(adminToken, 'Connectivity Edge Runtime');
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

        await expect(expectNoEvent(dashboardSocket, 'alarm_incident_changed')).resolves.toBeUndefined();
        await expect(findConnectivityAlarmIncidents(registered.edgeId)).resolves.toHaveLength(0);

        const initialOnlineStatus = waitForEdgeStatus(dashboardSocket);
        edgeSocket.emit('telemetry', {
            readings: [
                { deviceId: 'sensor-01', metric: 'temperature', value: 21.5, ts: Date.now() },
            ],
        });
        await expect(initialOnlineStatus).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                online: true,
                lastSeenAt: expect.any(String),
            }),
        );

        const offlineStatus = waitForEdgeStatus(dashboardSocket);
        const activeBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
        await closeSocket(edgeSocket);

        expectOfflineEdgeStatus(await offlineStatus, registered.edgeId);
        const activeChanged = await activeBroadcast;
        expect(activeChanged.incident).toMatchObject({
            edgeId: registered.edgeId,
            ruleId: 'system.edge_connectivity',
            sourceId: 'system',
            deviceId: 'edge',
            metric: 'connectivity',
            isActive: true,
            isAcknowledged: false,
            lifecycleState: 'active_unacknowledged',
            latestValue: false,
            rule: {
                conditionType: 'connectivity',
                severity: 'danger',
            },
        });

        const incidentId = activeChanged.incident.incidentId;

        const firstClearBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
        const firstReconnectedSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });
        await expect(expectNoEvent(dashboardSocket, 'edge_status')).resolves.toBeUndefined();
        const firstClearChanged = await firstClearBroadcast;
        expect(firstClearChanged.incident).toMatchObject({
            incidentId,
            isActive: false,
            isAcknowledged: false,
            lifecycleState: 'cleared_unacknowledged',
            acknowledgedBy: null,
            latestValue: true,
        });
        await expect(countConnectivityAlarmIncidents(registered.edgeId)).resolves.toBe(1);

        const duplicateOfflineStatus = waitForEdgeStatus(dashboardSocket);
        const duplicateActiveBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
        await closeSocket(firstReconnectedSocket);

        expectOfflineEdgeStatus(await duplicateOfflineStatus, registered.edgeId);
        const duplicateActiveChanged = await duplicateActiveBroadcast;
        expect(duplicateActiveChanged.incident).toMatchObject({
            incidentId,
            isActive: true,
            isAcknowledged: false,
            lifecycleState: 'active_unacknowledged',
            latestValue: false,
        });
        await expect(countConnectivityAlarmIncidents(registered.edgeId)).resolves.toBe(1);

        const ackBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
        const ackResponse = await fetch(
            `${socketBaseUrl}/api/edge-servers/${registered.edgeId}/alarm-incidents/${incidentId}/ack`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${userToken}` },
            },
        );
        expect(ackResponse.status).toBe(200);
        const ackChanged = await ackBroadcast;
        expect(ackChanged.incident).toMatchObject({
            incidentId,
            isActive: true,
            isAcknowledged: true,
            lifecycleState: 'active_acknowledged',
            acknowledgedBy: userId,
        });

        const closedBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
        const reconnectedSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });
        await expect(expectNoEvent(dashboardSocket, 'edge_status')).resolves.toBeUndefined();
        const closedChanged = await closedBroadcast;
        expect(closedChanged.incident).toMatchObject({
            incidentId,
            isActive: false,
            isAcknowledged: true,
            lifecycleState: 'closed',
            acknowledgedBy: userId,
            latestValue: true,
        });
        await expect(findConnectivityAlarmIncidents(registered.edgeId)).resolves.toHaveLength(1);

        const telemetryOnlineStatus = waitForEdgeStatus(dashboardSocket);
        reconnectedSocket.emit('telemetry', {
            readings: [
                { deviceId: 'sensor-01', metric: 'temperature', value: 22.5, ts: Date.now() },
            ],
        });
        await expect(telemetryOnlineStatus).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                online: true,
                lastSeenAt: expect.any(String),
            }),
        );

        const originalMarkEdgeOffline = edgeServersService.markEdgeOffline;
        let releaseOfflineWork: (() => void) | null = null;
        const offlineWorkStarted = new Promise<void>((resolve) => {
            vi.spyOn(edgeServersService, 'markEdgeOffline').mockImplementationOnce(async (edgeId) => {
                resolve();
                await new Promise<void>((release) => {
                    releaseOfflineWork = release;
                });
                return await originalMarkEdgeOffline(edgeId);
            });
        });
        const staleAlarmChanges: AlarmIncidentChangedPayload[] = [];
        const captureStaleAlarmChange = (payload: AlarmIncidentChangedPayload) => {
            staleAlarmChanges.push(payload);
        };
        dashboardSocket.on('alarm_incident_changed', captureStaleAlarmChange);

        const staleOfflineStatus = waitForEdgeStatus(dashboardSocket);
        await closeSocket(reconnectedSocket);
        await offlineWorkStarted;
        await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });
        releaseOfflineWork?.();

        expectOfflineEdgeStatus(await staleOfflineStatus, registered.edgeId);
        await new Promise((resolve) => setTimeout(resolve, 100));
        dashboardSocket.off('alarm_incident_changed', captureStaleAlarmChange);

        expect(staleAlarmChanges.filter((payload) => payload.incident.isActive)).toHaveLength(0);
        const incidents = await findConnectivityAlarmIncidents(registered.edgeId);
        expect(incidents).toHaveLength(1);
        expect(incidents[0]!.isActive).toBe(false);
        expect(incidents[0]!.isAcknowledged).toBe(true);
    }, 15_000);

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

        const initialOnlineStatus = waitForEvent<{ edgeId: string; online: boolean; lastSeenAt: string | null }>(
            dashboardSocket,
            'edge_status',
        );
        const initialTelemetry = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');
        edgeSocket.emit('telemetry', {
            readings: [
                { deviceId: 'sensor-01', metric: 'temperature', value: 21.5, ts: Date.now() },
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
                readings: [expect.objectContaining({ metric: 'temperature', last: 21.5 })],
            }),
        );

        const forcedDisconnect = waitForForcedDisconnect(edgeSocket);
        const offlineStatus = waitForEvent<{ edgeId: string; online: boolean; lastSeenAt: string | null }>(
            dashboardSocket,
            'edge_status',
        );
        const rotated = await rotateEdgeCredential(adminToken, registered.edgeId);

        await expect(forcedDisconnect).resolves.toEqual({
            edgeReason: 'credential_rotated',
            disconnectReason: 'io server disconnect',
        });
        await expect(offlineStatus).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                online: false,
                lastSeenAt: expect.any(String),
            }),
        );

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

        const restoredOnlineStatus = waitForEvent<{ edgeId: string; online: boolean; lastSeenAt: string | null }>(
            dashboardSocket,
            'edge_status',
        );
        const restoredTelemetry = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');
        reconnectedSocket.emit('telemetry', {
            readings: [
                { deviceId: 'sensor-01', metric: 'temperature', value: 23.5, ts: Date.now() },
            ],
        });

        await expect(restoredOnlineStatus).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                online: true,
                lastSeenAt: expect.any(String),
            }),
        );
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

        const initialOnlineStatus = waitForEvent<{ edgeId: string; online: boolean; lastSeenAt: string | null }>(
            dashboardSocket,
            'edge_status',
        );
        const initialTelemetry = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');
        edgeSocket.emit('telemetry', {
            readings: [
                { deviceId: 'motor-01', metric: 'running', value: true, ts: Date.now() },
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
        await blockEdge(adminToken, registered.edgeId);

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

        const restoredOnlineStatus = waitForEvent<{ edgeId: string; online: boolean; lastSeenAt: string | null }>(
            dashboardSocket,
            'edge_status',
        );
        const restoredTelemetry = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');
        reconnectedSocket.emit('telemetry', {
            readings: [
                { deviceId: 'motor-01', metric: 'running', value: false, ts: Date.now() },
            ],
        });

        await expect(restoredOnlineStatus).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                online: true,
                lastSeenAt: expect.any(String),
            }),
        );
        await expect(restoredTelemetry).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [expect.objectContaining({ metric: 'running', last: false })],
            }),
        );
    });
});
