import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { type Socket as ClientSocket } from 'socket.io-client';
import { app } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeServer } from '../../src/models/EdgeServer';
import { Telemetry } from '../../src/models/Telemetry';
import { User } from '../../src/models/User';
import { lastSeenRegistry } from '../../src/services/edge-servers.service';
import {
    bindEdgeToUser,
    cleanupClientSockets,
    connectDashboardSocket,
    connectEdgeSocket,
    createAdminSession,
    createUserSession,
    ensureServerListening,
    registerEdge,
    stopServerIfStarted,
} from './edge-socket.helpers';

type StoredCatalog = {
    edgeServerId: string;
    telemetry: Array<Record<string, unknown>>;
    commands: Array<Record<string, unknown>>;
    updatedAt?: Date;
};

async function readStoredCatalog(edgeId: string): Promise<StoredCatalog | null> {
    const edge = await EdgeServer.findById(edgeId)
        .select('latestCapabilitiesCatalog')
        .lean<{ latestCapabilitiesCatalog?: StoredCatalog | null } | null>()
        .exec();

    return edge?.latestCapabilitiesCatalog ?? null;
}

async function waitForStoredCatalog(edgeId: string): Promise<StoredCatalog> {
    const deadline = Date.now() + 2000;

    while (Date.now() < deadline) {
        const catalog = await readStoredCatalog(edgeId);
        if (catalog) {
            return catalog;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error('stored_catalog_timeout');
}

async function expectStoredCatalogUnchanged(edgeId: string, expected: StoredCatalog): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(readStoredCatalog(edgeId)).resolves.toEqual(expected);
}

function emitCapabilitiesCatalog(socket: ClientSocket, payload: Record<string, unknown>): void {
    socket.emit('capabilities_catalog', payload);
}

function expectNoForbiddenFields(value: unknown): void {
    const serialized = JSON.stringify(value);
    for (const forbidden of [
        'rawYaml',
        'mapping',
        'register',
        'registerType',
        'address',
        'connection',
        'credential',
        'secret',
        'url',
        'ip',
    ]) {
        expect(serialized).not.toContain(forbidden);
    }
}

describe('Edge capabilities catalog socket storage', () => {
    let socketBaseUrl = '';
    let startedSocketServer = false;
    const activeSockets = new Set<ClientSocket>();

    beforeAll(async () => {
        await connectDatabase();
        const listening = await ensureServerListening();
        socketBaseUrl = listening.socketBaseUrl;
        startedSocketServer = listening.startedSocketServer;
    });

    afterAll(async () => {
        await cleanupClientSockets(activeSockets);
        await Promise.all([EdgeServer.deleteMany({}), User.deleteMany({}), Telemetry.deleteMany({})]);
        await stopServerIfStarted(startedSocketServer);
        await disconnectDatabase();
    });

    beforeEach(async () => {
        await cleanupClientSockets(activeSockets);
        await Promise.all([EdgeServer.deleteMany({}), User.deleteMany({}), Telemetry.deleteMany({})]);
        lastSeenRegistry.clear();
    });

    afterEach(async () => {
        await cleanupClientSockets(activeSockets);
    });

    it('stores trusted edge snapshot and returns telemetry plus commands via catalog API', async () => {
        const { adminToken } = await createAdminSession('edge_catalog_happy_admin@test.com');
        const { userId, userToken } = await createUserSession('edge_catalog_happy_user@test.com');
        const edge = await registerEdge(adminToken, 'Capabilities Catalog Happy Edge');
        await bindEdgeToUser(adminToken, edge.edgeId, userId);

        const edgeSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: edge.edgeId,
            credentialSecret: edge.credentialSecret,
        });

        emitCapabilitiesCatalog(edgeSocket, {
            edgeServerId: edge.edgeId,
            telemetry: [
                {
                    deviceId: 'pump-01',
                    metric: 'pressure',
                    valueType: 'number',
                    label: 'Pump 01 / pressure',
                },
            ],
            commands: [
                {
                    deviceId: 'pump-01',
                    commandType: 'set_number',
                    valueType: 'number',
                    min: 0,
                    max: 10,
                    reportedMetric: 'pressure',
                    label: 'Pump 01 / set_number',
                },
            ],
        });

        await waitForStoredCatalog(edge.edgeId);

        const response = await request(app)
            .get(`/api/edge-servers/${edge.edgeId}/catalog`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: 'success',
            data: {
                edgeServerId: edge.edgeId,
                telemetry: [
                    {
                        deviceId: 'pump-01',
                        metric: 'pressure',
                        valueType: 'number',
                        label: 'Pump 01 / pressure',
                    },
                ],
                commands: [
                    {
                        deviceId: 'pump-01',
                        commandType: 'set_number',
                        valueType: 'number',
                        min: 0,
                        max: 10,
                        reportedMetric: 'pressure',
                        label: 'Pump 01 / set_number',
                    },
                ],
            },
        });
        expect(response.body.data.commands).toHaveLength(1);
        expectNoForbiddenFields(response.body.data);
    });

    it('rejects wrong or untrusted edge sessions without overwriting the stored sanitized catalog', async () => {
        const { adminToken } = await createAdminSession('edge_catalog_socket_admin@test.com');
        const { userId, userToken } = await createUserSession('edge_catalog_socket_user@test.com');
        const primary = await registerEdge(adminToken, 'Capabilities Catalog Edge');
        const other = await registerEdge(adminToken, 'Wrong Capabilities Catalog Edge');
        await bindEdgeToUser(adminToken, primary.edgeId, userId);

        const primarySocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: primary.edgeId,
            credentialSecret: primary.credentialSecret,
        });

        emitCapabilitiesCatalog(primarySocket, {
            edgeServerId: primary.edgeId,
            rawYaml: 'device: secret',
            telemetry: [
                {
                    deviceId: 'pump-01',
                    metric: 'pressure',
                    valueType: 'number',
                    label: 'Pump 01 / pressure',
                    mapping: { registerType: 'holding', address: 40001 },
                    connection: { url: 'tcp://192.0.2.10', credential: 'secret' },
                },
            ],
            commands: [
                {
                    deviceId: 'pump-01',
                    commandType: 'set_number',
                    valueType: 'number',
                    min: 0,
                    max: 10,
                    reportedMetric: 'pressure',
                    label: 'Pump 01 / set_number',
                    register: { address: 40002 },
                    ip: '192.0.2.10',
                },
            ],
        });

        const stored = await waitForStoredCatalog(primary.edgeId);
        expect(stored).toEqual({
            edgeServerId: primary.edgeId,
            telemetry: [
                {
                    deviceId: 'pump-01',
                    metric: 'pressure',
                    valueType: 'number',
                    label: 'Pump 01 / pressure',
                },
            ],
            commands: [
                {
                    deviceId: 'pump-01',
                    commandType: 'set_number',
                    valueType: 'number',
                    min: 0,
                    max: 10,
                    reportedMetric: 'pressure',
                    label: 'Pump 01 / set_number',
                },
            ],
            updatedAt: expect.any(Date),
        });
        expectNoForbiddenFields(stored);

        const wrongEdgeSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
            edgeId: other.edgeId,
            credentialSecret: other.credentialSecret,
        });

        emitCapabilitiesCatalog(wrongEdgeSocket, {
            edgeServerId: primary.edgeId,
            telemetry: [{ deviceId: 'evil', metric: 'overwrite', label: 'evil / overwrite' }],
            commands: [],
        });
        await expectStoredCatalogUnchanged(primary.edgeId, stored);

        emitCapabilitiesCatalog(primarySocket, {
            edgeServerId: primary.edgeId,
            telemetry: [
                {
                    deviceId: 'pump-01',
                    metric: 'pressure',
                    valueType: 'float',
                    label: 'Pump 01 / invalid',
                },
            ],
            commands: [],
        });
        await expectStoredCatalogUnchanged(primary.edgeId, stored);

        const dashboardSocket = await connectDashboardSocket(
            socketBaseUrl,
            activeSockets,
            userToken,
            primary.edgeId,
        );
        emitCapabilitiesCatalog(dashboardSocket, {
            edgeServerId: primary.edgeId,
            telemetry: [{ deviceId: 'dashboard', metric: 'overwrite', label: 'dashboard / overwrite' }],
            commands: [],
        });
        await expectStoredCatalogUnchanged(primary.edgeId, stored);
    });
});
