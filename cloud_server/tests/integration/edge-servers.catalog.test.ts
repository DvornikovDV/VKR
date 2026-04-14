import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app } from '../../src/app';
import { User } from '../../src/models/User';
import { EdgeServer } from '../../src/models/EdgeServer';
import { Telemetry } from '../../src/models/Telemetry';
import { AuthService } from '../../src/services/auth.service';

let adminToken: string;
let trustedUserToken: string;
let trustedUserId: string;
let strangerUserToken: string;

function numericRollup(last: number) {
    return {
        kind: 'numeric' as const,
        min: last,
        max: last,
        sum: last,
        count: 1,
        avg: last,
        last,
    };
}

function booleanRollup(last: boolean) {
    return {
        kind: 'boolean' as const,
        trueCount: last ? 1 : 0,
        falseCount: last ? 0 : 1,
        count: 1,
        last,
    };
}

function buildPersistentCredential() {
    return {
        version: 1,
        secretHash: 'edge_catalog_test_persistent_hash',
        issuedAt: new Date('2026-03-29T00:00:00.000Z'),
        lastAcceptedAt: null,
    };
}

async function createAdminUser(email: string): Promise<string> {
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN', subscriptionTier: 'PRO' }).exec();
    const { token } = await AuthService.login(email, 'password1234');
    return token;
}

async function createEdgeServer(name: string): Promise<string> {
    const res = await request(app)
        .post('/api/edge-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name });

    expect(res.status).toBe(201);
    return res.body.data?.edge?._id as string;
}

async function setEdgeRuntimeState(
    edgeId: string,
    input: {
        lifecycleState: 'Active' | 'Blocked';
        availability?: { online: boolean; lastSeenAt: Date | null };
        includePersistentCredential?: boolean;
    },
): Promise<void> {
    await EdgeServer.findByIdAndUpdate(edgeId, {
        $set: {
            lifecycleState: input.lifecycleState,
            availability: input.availability ?? { online: false, lastSeenAt: null },
            persistentCredential: input.includePersistentCredential === false
                ? null
                : buildPersistentCredential(),
        },
    }).exec();
}

beforeAll(async () => {
    await connectDatabase();
    await Promise.all([User.deleteMany({}), EdgeServer.deleteMany({}), Telemetry.deleteMany({})]);

    adminToken = await createAdminUser('catalog_admin@test.com');

    const trusted = await AuthService.register('catalog_trusted@test.com', 'password1234');
    trustedUserToken = trusted.token;
    trustedUserId = trusted.user._id.toString();
    await User.findByIdAndUpdate(trusted.user._id, { subscriptionTier: 'PRO' }).exec();

    const stranger = await AuthService.register('catalog_stranger@test.com', 'password1234');
    strangerUserToken = stranger.token;
});

afterAll(async () => {
    await Promise.all([User.deleteMany({}), EdgeServer.deleteMany({}), Telemetry.deleteMany({})]);
    await disconnectDatabase();
});

beforeEach(async () => {
    await Promise.all([EdgeServer.deleteMany({}), Telemetry.deleteMany({})]);
});

describe('T088 - Edge catalog identity and lifecycle access', () => {
    it('returns telemetry-derived catalog deduplicated by deviceId + metric within one edge', async () => {
        const edgeId = await createEdgeServer('CatalogMainEdge');
        const anotherEdgeId = new mongoose.Types.ObjectId().toString();

        await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: trustedUserId })
            .expect(200);

        await setEdgeRuntimeState(edgeId, { lifecycleState: 'Active' });

        await Telemetry.insertMany([
            {
                timestamp: new Date(),
                metadata: { edgeId, deviceId: 'pump-1' },
                metric: 'temperature',
                rollup: numericRollup(21.2),
            },
            {
                timestamp: new Date(),
                metadata: { edgeId, deviceId: 'pump-1' },
                metric: 'temperature',
                rollup: numericRollup(21.9),
            },
            {
                timestamp: new Date(),
                metadata: { edgeId, deviceId: 'pump-1' },
                metric: 'pressure',
                rollup: numericRollup(3.2),
            },
            {
                timestamp: new Date(),
                metadata: { edgeId, deviceId: 'valve-2' },
                metric: 'state',
                rollup: booleanRollup(true),
            },
            {
                timestamp: new Date(),
                metadata: { edgeId: anotherEdgeId, deviceId: 'y' },
                metric: 'z',
                rollup: numericRollup(100),
            },
        ]);

        await mongoose.connection.collection('telemetry').insertMany([
            {
                timestamp: new Date(),
                metadata: { edgeId, sourceId: 'legacy-plc-1', deviceId: 'legacy-device' },
                metric: 'legacy-temp',
                value: 55.5,
            },
            {
                timestamp: new Date(),
                metadata: { edgeId, sourceId: 'legacy-plc-2', deviceId: 'legacy-device' },
                metric: 'legacy-temp',
                value: 55.8,
            },
            {
                timestamp: new Date(),
                metadata: { edgeId, sourceId: 'legacy-plc-3', deviceId: '' },
                metric: 'ignored-empty-device',
                value: 1,
            },
        ]);

        const res = await request(app)
            .get(`/api/edge-servers/${edgeId}/catalog`)
            .set('Authorization', `Bearer ${trustedUserToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            status: 'success',
            data: [
                {
                    edgeServerId: edgeId,
                    deviceId: 'legacy-device',
                    metric: 'legacy-temp',
                    label: 'legacy-device / legacy-temp',
                },
                {
                    edgeServerId: edgeId,
                    deviceId: 'pump-1',
                    metric: 'pressure',
                    label: 'pump-1 / pressure',
                },
                {
                    edgeServerId: edgeId,
                    deviceId: 'pump-1',
                    metric: 'temperature',
                    label: 'pump-1 / temperature',
                },
                {
                    edgeServerId: edgeId,
                    deviceId: 'valve-2',
                    metric: 'state',
                    label: 'valve-2 / state',
                },
            ],
        });
    });

    it('returns 403 for non-trusted user access', async () => {
        const edgeId = await createEdgeServer('CatalogForbiddenEdge');
        await setEdgeRuntimeState(edgeId, { lifecycleState: 'Active' });

        await Telemetry.insertMany([
            {
                timestamp: new Date(),
                metadata: { edgeId, deviceId: 'pump-1' },
                metric: 'temperature',
                rollup: numericRollup(22),
            },
        ]);

        const res = await request(app)
            .get(`/api/edge-servers/${edgeId}/catalog`)
            .set('Authorization', `Bearer ${strangerUserToken}`);

        expect(res.status).toBe(403);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toMatch(/trusted/i);
    });

    it('returns trusted fleet with lifecycle and availability projected separately', async () => {
        const activeEdgeId = await createEdgeServer('CatalogActiveEdge');
        const blockedEdgeId = await createEdgeServer('CatalogBlockedEdge');
        const activeLastSeenAt = new Date();
        const blockedLastSeenAt = new Date(activeLastSeenAt.getTime() - 1_000);

        await request(app)
            .post(`/api/edge-servers/${activeEdgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: trustedUserId })
            .expect(200);

        await request(app)
            .post(`/api/edge-servers/${blockedEdgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: trustedUserId })
            .expect(200);

        await setEdgeRuntimeState(activeEdgeId, {
            lifecycleState: 'Active',
            availability: { online: true, lastSeenAt: activeLastSeenAt },
        });
        await setEdgeRuntimeState(blockedEdgeId, {
            lifecycleState: 'Blocked',
            availability: { online: true, lastSeenAt: blockedLastSeenAt },
        });

        const listResponse = await request(app)
            .get('/api/edge-servers')
            .set('Authorization', `Bearer ${trustedUserToken}`);

        expect(listResponse.status).toBe(200);
        expect(Array.isArray(listResponse.body.data)).toBe(true);
        expect(listResponse.body.data).toHaveLength(2);

        const byId = new Map<string, {
            lifecycleState: 'Active' | 'Blocked';
            availability: { online: boolean; lastSeenAt: string | null };
        }>(listResponse.body.data.map((entry: {
            _id: string;
            lifecycleState: 'Active' | 'Blocked';
            availability: { online: boolean; lastSeenAt: string | null };
        }) => [entry._id, entry]));

        const activeEdge = byId.get(activeEdgeId);
        const blockedEdge = byId.get(blockedEdgeId);

        expect(activeEdge).toBeDefined();
        expect(activeEdge?.lifecycleState).toBe('Active');
        expect(activeEdge?.availability.online).toBe(true);
        expect(activeEdge?.availability.lastSeenAt).toBe(activeLastSeenAt.toISOString());

        expect(blockedEdge).toBeDefined();
        expect(blockedEdge?.lifecycleState).toBe('Blocked');
        expect(blockedEdge?.availability.online).toBe(false);
        expect(blockedEdge?.availability.lastSeenAt).toBe(blockedLastSeenAt.toISOString());
    });

    it('returns 409 for trusted user catalog request when edge lifecycle is Blocked', async () => {
        const edgeId = await createEdgeServer('CatalogBlockedAccessEdge');

        await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: trustedUserId })
            .expect(200);

        await setEdgeRuntimeState(edgeId, {
            lifecycleState: 'Blocked',
            includePersistentCredential: true,
        });

        const res = await request(app)
            .get(`/api/edge-servers/${edgeId}/catalog`)
            .set('Authorization', `Bearer ${trustedUserToken}`);

        expect(res.status).toBe(409);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toMatch(/active/i);
    });
});
