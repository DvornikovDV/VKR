/**
 * Integration tests for commandBindings validation in the upsert path (T005 proof).
 *
 * Proves that the service-owned validation path:
 *   1. Accepts a valid commandBindings[] entry and persists it.
 *   2. Rejects an invalid commandType that is not 'set_bool' or 'set_number'.
 *   3. Rejects an invalid deviceId that fails DEVICE_ID_PATTERN.
 *   4. Normalizes missing commandBindings to [] (legacy document safety).
 *
 * These tests are the primary proof for T005 (service-owned validation) and
 * the positive side proof for T011 (save/load commandBindings).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app } from '../../src/app';
import { User } from '../../src/models/User';
import { Diagram } from '../../src/models/Diagram';
import { EdgeServer } from '../../src/models/EdgeServer';
import { DiagramBindings } from '../../src/models/DiagramBindings';
import { AuthService } from '../../src/services/auth.service';

// ── Test state ────────────────────────────────────────────────────────────

let adminToken: string;
let userToken: string;
let userId: string;
let edgeId: string;

// ── Helpers ───────────────────────────────────────────────────────────────

async function createEdgeAndTrustUser(userObjectId: string): Promise<string> {
    const edge = await EdgeServer.create({
        name: 'Test Edge',
        lifecycleState: 'Active',
        trustedUsers: [new mongoose.Types.ObjectId(userObjectId)],
        credentialHash: 'dummy',
        credentialVersion: 1,
    });
    return edge._id.toString();
}

async function createDiagram(ownerId: string): Promise<string> {
    const diagram = await Diagram.create({
        ownerId: new mongoose.Types.ObjectId(ownerId),
        name: 'Test Diagram',
        layout: { widgets: [] },
    });
    return diagram._id.toString();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeAll(async () => {
    await connectDatabase();
    await Promise.all([
        User.deleteMany({}),
        Diagram.deleteMany({}),
        EdgeServer.deleteMany({}),
        DiagramBindings.deleteMany({}),
    ]);

    const { user } = await AuthService.register('admin_cb_test@test.com', 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN' }).exec();
    const { token: aToken } = await AuthService.login('admin_cb_test@test.com', 'password1234');
    adminToken = aToken;

    const { user: u, token: uToken } = await AuthService.register('user_cb_test@test.com', 'password1234');
    userToken = uToken;
    userId = u._id.toString();

    edgeId = await createEdgeAndTrustUser(userId);
});

afterAll(async () => {
    await Promise.all([
        User.deleteMany({}),
        Diagram.deleteMany({}),
        EdgeServer.deleteMany({}),
        DiagramBindings.deleteMany({}),
    ]);
    await disconnectDatabase();
});

beforeEach(async () => {
    await Promise.all([Diagram.deleteMany({}), DiagramBindings.deleteMany({})]);
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('T005 — commandBindings service-owned validation via upsert path', () => {
    it('accepts a valid set_bool commandBinding alongside a widgetBinding (201)', async () => {
        const diagramId = await createDiagram(userId);

        const res = await request(app)
            .post(`/api/diagrams/${diagramId}/bindings`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                edgeServerId: edgeId,
                widgetBindings: [{ widgetId: 'w1', deviceId: 'pump_main', metric: 'actual_state' }],
                commandBindings: [{ widgetId: 'toggle1', deviceId: 'pump_main', commandType: 'set_bool' }],
            });

        expect(res.status).toBe(201);
        expect(res.body.data.widgetBindings).toHaveLength(1);
        expect(res.body.data.commandBindings).toHaveLength(1);
        expect(res.body.data.commandBindings[0]).toMatchObject({
            widgetId: 'toggle1',
            deviceId: 'pump_main',
            commandType: 'set_bool',
        });
    });

    it('accepts a valid set_number commandBinding (201)', async () => {
        const diagramId = await createDiagram(userId);

        const res = await request(app)
            .post(`/api/diagrams/${diagramId}/bindings`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                edgeServerId: edgeId,
                widgetBindings: [],
                commandBindings: [{ widgetId: 'slider1', deviceId: 'pump_main', commandType: 'set_number' }],
            });

        expect(res.status).toBe(201);
        expect(res.body.data.commandBindings[0].commandType).toBe('set_number');
    });

    it('rejects an invalid commandType (not set_bool or set_number) with 400', async () => {
        const diagramId = await createDiagram(userId);

        const res = await request(app)
            .post(`/api/diagrams/${diagramId}/bindings`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                edgeServerId: edgeId,
                widgetBindings: [],
                commandBindings: [{ widgetId: 'w1', deviceId: 'pump_main', commandType: 'set_string' }],
            });

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toContain('commandType');
    });

    it('rejects an invalid commandBinding deviceId (spaces/special chars) with 400', async () => {
        const diagramId = await createDiagram(userId);

        const res = await request(app)
            .post(`/api/diagrams/${diagramId}/bindings`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                edgeServerId: edgeId,
                widgetBindings: [],
                commandBindings: [{ widgetId: 'w1', deviceId: 'device with spaces', commandType: 'set_bool' }],
            });

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).toContain('deviceId');
    });

    it('normalizes missing commandBindings to [] and saves successfully (legacy safety)', async () => {
        const diagramId = await createDiagram(userId);

        const res = await request(app)
            .post(`/api/diagrams/${diagramId}/bindings`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                edgeServerId: edgeId,
                widgetBindings: [{ widgetId: 'w1', deviceId: 'pump_main', metric: 'actual_state' }],
                // commandBindings intentionally omitted
            });

        expect(res.status).toBe(201);
        expect(res.body.data.commandBindings).toEqual([]);
    });

    it('reload returns both widgetBindings and commandBindings (T011 positive path)', async () => {
        const diagramId = await createDiagram(userId);

        await request(app)
            .post(`/api/diagrams/${diagramId}/bindings`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                edgeServerId: edgeId,
                widgetBindings: [{ widgetId: 'w1', deviceId: 'pump_main', metric: 'actual_state' }],
                commandBindings: [{ widgetId: 'toggle1', deviceId: 'pump_main', commandType: 'set_bool' }],
            });

        const get = await request(app)
            .get(`/api/diagrams/${diagramId}/bindings`)
            .set('Authorization', `Bearer ${userToken}`);

        expect(get.status).toBe(200);
        const profile = get.body.data[0];
        expect(profile.widgetBindings).toHaveLength(1);
        expect(profile.commandBindings).toHaveLength(1);
        expect(profile.commandBindings[0].commandType).toBe('set_bool');
    });
});
