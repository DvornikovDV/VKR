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
        .send({ name, apiKeyHash: `hash_${name}` });

    expect(res.status).toBe(201);
    return res.body.data._id as string;
}

beforeAll(async () => {
    await connectDatabase();
    await Promise.all([User.deleteMany({}), EdgeServer.deleteMany({}), Telemetry.deleteMany({})]);

    adminToken = await createAdminUser('catalog_admin@test.com');

    const trusted = await AuthService.register('catalog_trusted@test.com', 'password1234');
    trustedUserToken = trusted.token;
    trustedUserId = trusted.user._id.toString();

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

        await Telemetry.insertMany([
            {
                timestamp: new Date(),
                metadata: { edgeId, sourceId: 'plc-a', deviceId: 'pump-1' },
                metric: 'temperature',
                value: 21.2,
            },
            {
                timestamp: new Date(),
                metadata: { edgeId, sourceId: 'plc-a', deviceId: 'pump-1' },
                metric: 'temperature',
                value: 21.9,
            },
            {
                timestamp: new Date(),
                metadata: { edgeId, sourceId: 'plc-a', deviceId: 'pump-1' },
                metric: 'pressure',
                value: 3.2,
            },
            {
                timestamp: new Date(),
                metadata: { edgeId, sourceId: '   ', deviceId: 'valve-2' },
                metric: 'state',
                value: true,
            },
            {
                timestamp: new Date(),
                metadata: { edgeId: anotherEdgeId, sourceId: 'x', deviceId: 'y' },
                metric: 'z',
                value: 100,
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
                    sourceId: null,
                    deviceId: 'valve-2',
                    metric: 'state',
                    label: 'unknown-source / valve-2 / state',
                },
                {
                    edgeServerId: edgeId,
                    sourceId: 'plc-a',
                    deviceId: 'pump-1',
                    metric: 'pressure',
                    label: 'plc-a / pump-1 / pressure',
                },
                {
                    edgeServerId: edgeId,
                    sourceId: 'plc-a',
                    deviceId: 'pump-1',
                    metric: 'temperature',
                    label: 'plc-a / pump-1 / temperature',
                },
            ],
        });
    });

    it('returns 403 for non-trusted user access', async () => {
        const edgeId = await createEdgeServer('CatalogForbiddenEdge');

        await Telemetry.insertMany([
            {
                timestamp: new Date(),
                metadata: { edgeId, sourceId: 'plc-a', deviceId: 'pump-1' },
                metric: 'temperature',
                value: 22,
            },
        ]);

        const res = await request(app)
            .get(`/api/edge-servers/${edgeId}/catalog`)
            .set('Authorization', `Bearer ${strangerUserToken}`);

        expect(res.status).toBe(403);
        expect(res.body.status).toBe('error');
        expect(res.body.message).toMatch(/trusted/i);
    });
});
