/**
 * Integration tests for GET /api/edge-servers/:edgeId/catalog (US9).
 *
 * Covers T061 scenarios:
 *   1. Trusted user can fetch telemetry-derived catalog entries.
 *   2. Non-trusted user receives 403.
 */
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

async function createAdminUser(email: string): Promise<string> {
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN' }).exec();
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

async function setLifecycleState(edgeId: string, lifecycleState: string): Promise<void> {
    const persistentCredential =
        lifecycleState === 'Active'
            ? {
                  version: 1,
                  secretHash: 'edge_catalog_test_persistent_hash',
                  issuedAt: new Date('2026-03-29T00:00:00.000Z'),
                  lastAcceptedAt: null,
                  revokedAt: null,
                  revocationReason: null,
              }
            : null;

    await EdgeServer.findByIdAndUpdate(edgeId, {
        $set: {
            lifecycleState,
            availability: { online: false, lastSeenAt: null },
            persistentCredential,
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

describe('T061 - Edge catalog integration', () => {
    it('returns telemetry-derived catalog for a trusted user (200)', async () => {
        const edgeId = await createEdgeServer('CatalogMainEdge');
        const anotherEdgeId = new mongoose.Types.ObjectId().toString();

        await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: trustedUserId })
            .expect(200);

        await setLifecycleState(edgeId, 'Active');

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

        await mongoose.connection.collection('telemetry').insertOne({
            timestamp: new Date(),
            metadata: { edgeId, sourceId: 'legacy-plc', deviceId: 'legacy-device' },
            metric: 'legacy-temp',
            value: 55.5,
        });

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
        await setLifecycleState(edgeId, 'Active');

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

    it('T023-4 returns only Active trusted edges in USER readiness list', async () => {
        const activeEdgeId = await createEdgeServer('CatalogActiveEdge');
        const reonboardingEdgeId = await createEdgeServer('CatalogRecoveryEdge');

        await request(app)
            .post(`/api/edge-servers/${activeEdgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: trustedUserId })
            .expect(200);

        await request(app)
            .post(`/api/edge-servers/${reonboardingEdgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: trustedUserId })
            .expect(200);

        await setLifecycleState(activeEdgeId, 'Active');
        await setLifecycleState(reonboardingEdgeId, 'Re-onboarding Required');

        const listResponse = await request(app)
            .get('/api/edge-servers')
            .set('Authorization', `Bearer ${trustedUserToken}`);

        expect(listResponse.status).toBe(200);
        expect(Array.isArray(listResponse.body.data)).toBe(true);
        expect(listResponse.body.data).toHaveLength(1);
        expect(listResponse.body.data[0]?._id).toBe(activeEdgeId);
        expect(listResponse.body.data[0]?.lifecycleState).toBe('Active');
    });

    it('T023-5 returns 409 for trusted user catalog request when edge is not Active', async () => {
        const edgeId = await createEdgeServer('CatalogInactiveEdge');

        await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: trustedUserId })
            .expect(200);

        await setLifecycleState(edgeId, 'Re-onboarding Required');

        const res = await request(app)
            .get(`/api/edge-servers/${edgeId}/catalog`)
            .set('Authorization', `Bearer ${trustedUserToken}`);

        expect(res.status).toBe(409);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toMatch(/active/i);
    });
});
