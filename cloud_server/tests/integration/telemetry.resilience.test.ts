import { type Socket, type Server as IOServer } from 'socket.io';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeServer } from '../../src/models/EdgeServer';
import { Telemetry } from '../../src/models/Telemetry';
import { User } from '../../src/models/User';
import { lastSeenRegistry } from '../../src/services/edge-servers.service';
import { TelemetryAggregatorService } from '../../src/services/telemetry-aggregator.service';
import { type TelemetryBroadcast, registerTelemetryHandler } from '../../src/socket/events/telemetry';
import {
    bindEdgeToUser,
    cleanupClientSockets,
    connectDashboardSocket,
    connectEdgeSocket,
    createAdminSession,
    createUserSession,
    ensureServerListening,
    expectNoEvent,
    registerEdge,
    stopServerIfStarted,
    waitForEvent,
} from './edge-socket.helpers';

function makeMockIO() {
    const emitCalls: Array<{ room: string; event: string; payload: unknown }> = [];

    const mockIO = {
        to: (room: string) => ({
            emit: (event: string, payload: unknown) => {
                emitCalls.push({ room, event, payload });
            },
        }),
    } as unknown as IOServer;

    return { mockIO, emitCalls };
}

function makeMockSocket(edgeId: string): Socket & { _trigger: (event: string, payload: unknown) => void } {
    const handlers = new Map<string, (payload: unknown) => void>();

    return {
        connected: true,
        data: { edgeId, trustedEdgeSession: true },
        on: (event: string, handler: (payload: unknown) => void) => {
            handlers.set(event, handler);
        },
        _trigger: (event: string, payload: unknown) => {
            handlers.get(event)?.(payload);
        },
    } as unknown as Socket & { _trigger: (event: string, payload: unknown) => void };
}

async function waitForPersistedEdge(
    edgeId: string,
    predicate: (edge: { lifecycleState: string; availability?: { online?: boolean; lastSeenAt?: Date | null } }) => boolean,
    timeoutMs = 2500,
): Promise<{ lifecycleState: string; availability?: { online?: boolean; lastSeenAt?: Date | null } }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const edge = await EdgeServer.findById(edgeId)
            .select('lifecycleState availability')
            .lean<{ lifecycleState: string; availability?: { online?: boolean; lastSeenAt?: Date | null } } | null>()
            .exec();

        if (edge && predicate(edge)) {
            return edge;
        }

        await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(`edge_state_timeout:${edgeId}`);
}

describe('T033 - Telemetry DB failover', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        TelemetryAggregatorService.resetForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('T033-1: drain catches Telemetry.insertMany error and does not rethrow', async () => {
        vi.spyOn(Telemetry, 'insertMany').mockRejectedValueOnce(
            new Error('MongoNetworkError: connection timed out'),
        );

        TelemetryAggregatorService.ingest('fakeedge001', [
            { deviceId: 'dev1', metric: 'temp', value: 42, ts: Date.now() },
        ]);

        expect(TelemetryAggregatorService.windowSize()).toBe(1);
        await expect(TelemetryAggregatorService.drain({ force: true })).resolves.toBeUndefined();
        expect(TelemetryAggregatorService.windowSize()).toBe(0);
        expect(Telemetry.insertMany).toHaveBeenCalledOnce();
    });

    it('T033-2: broadcast reaches dashboards before drain path even when DB writes fail', async () => {
        vi.spyOn(Telemetry, 'insertMany').mockRejectedValue(
            new Error('MongoServerError: write failed'),
        );

        const edgeId = 'deadbeef00000000000cafef';
        const { mockIO, emitCalls } = makeMockIO();
        const mockSocket = makeMockSocket(edgeId);

        registerTelemetryHandler(mockSocket, mockIO, edgeId);

        mockSocket._trigger('telemetry', {
            readings: [
                {
                    deviceId: 'device_A',
                    metric: 'pressure',
                    value: 3.14,
                    ts: Date.now(),
                },
            ],
        });

        expect(emitCalls).toHaveLength(2);
        expect(emitCalls[0]?.event).toBe('edge_status');
        expect(emitCalls[1]?.event).toBe('telemetry');

        const broadcastPayload = emitCalls[1]?.payload as {
            edgeId: string;
            readings: Array<{ metric: string; last: number }>;
        };

        expect(broadcastPayload.edgeId).toBe(edgeId);
        expect(broadcastPayload.readings).toHaveLength(1);
        expect(broadcastPayload.readings[0]?.metric).toBe('pressure');
        expect(broadcastPayload.readings[0]?.last).toBe(3.14);

        await expect(TelemetryAggregatorService.drain()).resolves.toBeUndefined();
    });

    it('T033-3: ingest remains an in-memory operation without DB dependency', () => {
        vi.spyOn(Telemetry, 'insertMany').mockRejectedValue(new Error('DB unavailable'));

        expect(() => {
            TelemetryAggregatorService.ingest('edgeXYZ', [
                { deviceId: 'd', metric: 'm', value: true, ts: Date.now() },
            ]);
        }).not.toThrow();

        expect(TelemetryAggregatorService.windowSize()).toBeGreaterThan(0);
    });
});

describe('T087 - Telemetry continuity under lifecycle model', () => {
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
        await Promise.all([Telemetry.deleteMany({}), EdgeServer.deleteMany({}), User.deleteMany({})]);
        await stopServerIfStarted(startedSocketServer);
        await disconnectDatabase();
    });

    beforeEach(async () => {
        await cleanupClientSockets(activeSockets);
        await Promise.all([Telemetry.deleteMany({}), EdgeServer.deleteMany({}), User.deleteMany({})]);
        lastSeenRegistry.clear();
    });

    afterEach(async () => {
        await cleanupClientSockets(activeSockets);
    });

    it('keeps lifecycle unchanged on normal disconnect while availability transitions to offline', async () => {
        const { adminToken } = await createAdminSession('telemetry_resilience_disconnect_admin@test.com');
        const { userId, userToken } = await createUserSession('telemetry_resilience_disconnect_user@test.com');
        const registered = await registerEdge(adminToken, 'Telemetry Continuity Edge');
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

        const onlineEvent = waitForEvent<{ edgeId: string; online: boolean }>(dashboardSocket, 'edge_status');
        const telemetryEvent = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');

        edgeSocket.emit('telemetry', {
            readings: [
                { deviceId: 'sensor-01', metric: 'temperature', value: 17.4, ts: Date.now() },
            ],
        });

        await expect(onlineEvent).resolves.toEqual({ edgeId: registered.edgeId, online: true });
        await expect(telemetryEvent).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [expect.objectContaining({ deviceId: 'sensor-01', metric: 'temperature' })],
            }),
        );

        const offlineEvent = waitForEvent<{ edgeId: string; online: boolean }>(dashboardSocket, 'edge_status');
        edgeSocket.disconnect();

        await expect(offlineEvent).resolves.toEqual({ edgeId: registered.edgeId, online: false });

        const persisted = await waitForPersistedEdge(
            registered.edgeId,
            (edge) => edge.lifecycleState === 'Active' && edge.availability?.online === false,
        );
        expect(persisted.lifecycleState).toBe('Active');
        expect(persisted.availability?.online).toBe(false);
        expect(persisted.availability?.lastSeenAt).not.toBeNull();
    });

    it('keeps trusted session alive during partial source degradation and forwards unaffected telemetry', async () => {
        const { adminToken } = await createAdminSession('telemetry_resilience_partial_admin@test.com');
        const { userId, userToken } = await createUserSession('telemetry_resilience_partial_user@test.com');
        const registered = await registerEdge(adminToken, 'Telemetry Partial Degradation Edge');
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

        const firstOnline = waitForEvent<{ edgeId: string; online: boolean }>(dashboardSocket, 'edge_status');
        const firstTelemetry = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');
        edgeSocket.emit('telemetry', {
            readings: [
                { deviceId: 'pump-01', metric: 'pressure', value: 3.2, ts: Date.now() },
                { deviceId: 'pump-01', metric: '', value: 10, ts: Date.now() },
                { deviceId: 'pump-02', metric: 'temperature', value: 7.1, ts: Date.now() + 20_000 },
            ],
        });

        await expect(firstOnline).resolves.toEqual({ edgeId: registered.edgeId, online: true });
        await expect(firstTelemetry).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [expect.objectContaining({ deviceId: 'pump-01', metric: 'pressure', last: 3.2 })],
            }),
        );

        const secondTelemetry = waitForEvent<TelemetryBroadcast>(dashboardSocket, 'telemetry');
        edgeSocket.emit('telemetry', {
            readings: [
                { deviceId: 'pump-01', metric: 'pressure', value: 3.4, ts: Date.now() },
                { deviceId: '', metric: 'pressure', value: 4.1, ts: Date.now() },
            ],
        });

        await expect(secondTelemetry).resolves.toEqual(
            expect.objectContaining({
                edgeId: registered.edgeId,
                readings: [expect.objectContaining({ deviceId: 'pump-01', metric: 'pressure', last: 3.4 })],
            }),
        );

        expect(edgeSocket.connected).toBe(true);
        await expect(expectNoEvent(edgeSocket, 'edge_disconnect', 300)).resolves.toBeUndefined();

        const persisted = await waitForPersistedEdge(
            registered.edgeId,
            (edge) => edge.lifecycleState === 'Active' && edge.availability?.online === true,
        );
        expect(persisted.lifecycleState).toBe('Active');
        expect(persisted.availability?.online).toBe(true);
    });
});
