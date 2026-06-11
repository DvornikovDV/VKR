/**
 * Integration tests for Diagrams API (US2).
 * Requires a running MongoDB at MONGO_URI (set in tests/setup.ts).
 *
 * Covers:
 *   T020  — OCC conflict (409) on PUT with stale __v
 *   T020b — bindingsInvalidated:true on PUT when DiagramBindings exist
 *   T021c — cascade-delete of DiagramBindings when parent diagram is Hard Deleted
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app } from '../../src/app';
import { User } from '../../src/models/User';
import { Diagram } from '../../src/models/Diagram';
import { DiagramBindings } from '../../src/models/DiagramBindings';
import { AuthService } from '../../src/services/auth.service';

// ── Test state ────────────────────────────────────────────────────────────

let token: string;
let userId: string;
let adminToken: string;
let adminId: string;

// ── Helpers ───────────────────────────────────────────────────────────────

async function createTestDiagram(name = 'Test Diagram') {
    const diagram = await Diagram.create({
        ownerId: new mongoose.Types.ObjectId(userId),
        name,
        layout: { widgets: [] },
    });
    return diagram;
}

async function createFakeEdgeServerId(): Promise<mongoose.Types.ObjectId> {
    // EdgeServer model is registered in US3.
    // For these tests we only need a valid ObjectId as edgeServerId reference.
    return new mongoose.Types.ObjectId();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeAll(async () => {
    await connectDatabase();

    // Clean test collections
    await User.deleteMany({});
    await Diagram.deleteMany({});
    await DiagramBindings.deleteMany({});
    await Diagram.syncIndexes();

    // Register test user and get token
    const result = await AuthService.register('diagrams_integration@test.com', 'password1234');
    token = result.token;
    userId = result.user._id.toString();

    const adminResult = await AuthService.register('diagrams_admin@test.com', 'password1234');
    adminId = adminResult.user._id.toString();
    await User.updateOne({ _id: adminId }, { role: 'ADMIN' });
    adminToken = (await AuthService.login('diagrams_admin@test.com', 'password1234')).token;
});

afterAll(async () => {
    await User.deleteMany({});
    await Diagram.deleteMany({});
    await DiagramBindings.deleteMany({});
    await disconnectDatabase();
});

beforeEach(async () => {
    // Keep user, clean diagrams and bindings between tests
    await Diagram.deleteMany({});
    await DiagramBindings.deleteMany({});
    await User.updateOne({ _id: userId }, { subscriptionTier: 'FREE' });
    await User.updateOne({ _id: adminId }, { role: 'ADMIN', subscriptionTier: 'FREE' });
});

describe('Layout payload integrity', () => {
    it('should preserve an empty layout object through create and get-by-id', async () => {
        const createRes = await request(app)
            .post('/api/diagrams')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Empty layout diagram', layout: {} });

        expect(createRes.status).toBe(201);
        expect(createRes.body.data.layout).toEqual({});
        expect(createRes.body.data.sourceTemplateId).toBeUndefined();

        const diagramId = createRes.body.data._id as string;
        const stored = await Diagram.findById(diagramId).lean();
        expect(stored?.sourceTemplateId).toBeUndefined();

        const getRes = await request(app)
            .get(`/api/diagrams/${diagramId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(getRes.status).toBe(200);
        expect(getRes.body.data.layout).toEqual({});
    });
});

describe('Admin template creation through POST /api/diagrams', () => {
    it('bypasses only the regular USER FREE quota for an authenticated Admin', async () => {
        await Diagram.create([
            { ownerId: adminId, name: 'Admin template 1', layout: {} },
            { ownerId: adminId, name: 'Admin template 2', layout: {} },
            { ownerId: adminId, name: 'Admin template 3', layout: {} },
        ]);

        const response = await request(app)
            .post('/api/diagrams')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: '  Empty Admin template  ', layout: {} });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            ownerId: adminId,
            name: 'Empty Admin template',
            layout: {},
        });

        const stored = await Diagram.findById(response.body.data._id).lean();
        expect(stored?.quotaSlot).toBeUndefined();
        expect(await Diagram.countDocuments({ ownerId: adminId })).toBe(4);
    });

    it('keeps name and plain-object layout validation active for Admin creation', async () => {
        const invalidName = await request(app)
            .post('/api/diagrams')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: '   ', layout: {} });
        const invalidLayout = await request(app)
            .post('/api/diagrams')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Invalid layout', layout: [] });

        expect(invalidName.status).toBe(400);
        expect(invalidLayout.status).toBe(400);
        expect(await Diagram.countDocuments({ ownerId: adminId })).toBe(0);
    });
});

describe('Persisted quota identity and slot release', () => {
    it('keeps the regular USER FREE quota unchanged', async () => {
        const responses = [];
        for (let index = 0; index < 4; index += 1) {
            responses.push(
                await request(app)
                    .post('/api/diagrams')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ name: `FREE diagram ${index}`, layout: {} }),
            );
        }

        expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 403]);
        expect(await Diagram.countDocuments({ ownerId: userId })).toBe(3);
    });

    it('does not start creation while owner quota reconciliation is pending', async () => {
        await User.updateOne(
            { _id: userId },
            { $set: { diagramQuotaMutationPending: true } },
        );

        const response = await request(app)
            .post('/api/diagrams')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Blocked by quota mutation', layout: {} });

        expect(response.status).toBe(409);
        expect(await Diagram.countDocuments({ ownerId: userId })).toBe(0);

        await User.updateOne(
            { _id: userId },
            { $set: { diagramQuotaMutationPending: false } },
        );
    });

    it('uses the persisted PRO tier instead of the stale FREE tier in the JWT', async () => {
        await User.updateOne({ _id: userId }, { subscriptionTier: 'PRO' });

        const responses = [];
        for (let index = 0; index < 4; index += 1) {
            responses.push(
                await request(app)
                    .post('/api/diagrams')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ name: `Persisted PRO ${index}`, layout: {} }),
            );
        }

        expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201]);
        expect(await Diagram.countDocuments({ ownerId: userId, quotaSlot: { $exists: true } })).toBe(0);
    });

    it('reconciles remaining FREE diagrams after hard delete before a freed slot can be reused', async () => {
        const created = await Diagram.create([
            { ownerId: userId, name: 'Old slot 1', layout: {}, quotaSlot: 1 },
            { ownerId: userId, name: 'Old slot 2', layout: {}, quotaSlot: 2 },
            { ownerId: userId, name: 'Old slot 3', layout: {}, quotaSlot: 3 },
            { ownerId: userId, name: 'Quota excess', layout: {} },
        ]);

        const deleteRes = await request(app)
            .delete(`/api/diagrams/${created[0]!._id.toString()}`)
            .set('Authorization', `Bearer ${token}`);

        expect(deleteRes.status).toBe(204);

        const remaining = await Diagram.find({ ownerId: userId }).sort({ updatedAt: -1, _id: -1 }).lean();
        expect(remaining).toHaveLength(3);
        expect(remaining.every((diagram) => [1, 2, 3].includes(diagram.quotaSlot as number))).toBe(true);
        expect(new Set(remaining.map((diagram) => diagram.quotaSlot))).toEqual(new Set([1, 2, 3]));
        expect(remaining.find((diagram) => diagram.name === 'Quota excess')?.quotaSlot).toBeDefined();

        const blockedCreate = await request(app)
            .post('/api/diagrams')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Cannot bypass remaining excess', layout: {} });

        expect(blockedCreate.status).toBe(403);
        expect(await Diagram.countDocuments({ ownerId: userId })).toBe(3);
    });
});

// ── T020: OCC conflict (409) ──────────────────────────────────────────────

describe('T020 — PUT /api/diagrams/:id OCC conflict', () => {
    it('should return 409 when __v is stale (concurrent edit)', async () => {
        const diagram = await createTestDiagram('OCC Test');
        const currentVersion = diagram.__v; // = 0

        // First update — should succeed and bump __v to 1
        const res1 = await request(app)
            .put(`/api/diagrams/${diagram._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Updated once', layout: {}, __v: currentVersion });

        expect(res1.status).toBe(200);

        // Second update with stale __v (still 0) — should fail with 409
        const res2 = await request(app)
            .put(`/api/diagrams/${diagram._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Updated twice conflict', layout: {}, __v: currentVersion });

        expect(res2.status).toBe(409);
    });

    it('should return 200 with updated diagram when __v is correct', async () => {
        const diagram = await createTestDiagram('OCC OK');

        const res = await request(app)
            .put(`/api/diagrams/${diagram._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Fresh Update', layout: { widgets: [1] }, __v: 0 });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Fresh Update');
    });

    it('should return 400 if __v is missing from request body', async () => {
        const diagram = await createTestDiagram('Missing v');

        const res = await request(app)
            .put(`/api/diagrams/${diagram._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'No version' }); // no __v

        expect(res.status).toBe(400);
    });
});

// ── T020b: bindingsInvalidated flag ───────────────────────────────────────

describe('T020b — PUT returns bindingsInvalidated:true when bindings exist', () => {
    it('should include bindingsInvalidated:true when DiagramBindings exist for the diagram', async () => {
        const diagram = await createTestDiagram('With Bindings');
        const edgeServerId = await createFakeEdgeServerId();

        // Manually create a DiagramBindings document
        await DiagramBindings.create({
            diagramId: diagram._id,
            ownerId: new mongoose.Types.ObjectId(userId),
            edgeServerId,
            widgetBindings: [{ widgetId: 'w1', deviceId: 'd1', metric: 'temp' }],
        });

        const res = await request(app)
            .put(`/api/diagrams/${diagram._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Updated with bindings', layout: {}, __v: 0 });

        expect(res.status).toBe(200);
        expect(res.body.bindingsInvalidated).toBe(true);
    });

    it('should include bindingsInvalidated:false when no DiagramBindings exist', async () => {
        const diagram = await createTestDiagram('No Bindings');

        const res = await request(app)
            .put(`/api/diagrams/${diagram._id.toString()}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Updated no bindings', layout: {}, __v: 0 });

        expect(res.status).toBe(200);
        expect(res.body.bindingsInvalidated).toBe(false);
    });
});

// ── T021c: cascade-delete DiagramBindings on Hard Delete ─────────────────

describe('T021c — DELETE /api/diagrams/:id cascade-deletes DiagramBindings', () => {
    it('should cascade-delete all DiagramBindings when parent diagram is deleted', async () => {
        const diagram = await createTestDiagram('Cascade Parent');
        const edgeServerId1 = await createFakeEdgeServerId();
        const edgeServerId2 = await createFakeEdgeServerId();

        // Create two binding sets for this diagram
        await DiagramBindings.create([
            {
                diagramId: diagram._id,
                ownerId: new mongoose.Types.ObjectId(userId),
                edgeServerId: edgeServerId1,
                widgetBindings: [],
            },
            {
                diagramId: diagram._id,
                ownerId: new mongoose.Types.ObjectId(userId),
                edgeServerId: edgeServerId2,
                widgetBindings: [],
            },
        ]);

        // Confirm bindings exist
        const before = await DiagramBindings.countDocuments({ diagramId: diagram._id });
        expect(before).toBe(2);

        // Delete the diagram
        const res = await request(app)
            .delete(`/api/diagrams/${diagram._id.toString()}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(204);

        // Confirm cascade
        const after = await DiagramBindings.countDocuments({ diagramId: diagram._id });
        expect(after).toBe(0);
    });

    it('should return 204 on successful delete', async () => {
        const diagram = await createTestDiagram('Clean Delete');

        const res = await request(app)
            .delete(`/api/diagrams/${diagram._id.toString()}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(204);
    });

    it('should return 404 when diagram does not exist', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();

        const res = await request(app)
            .delete(`/api/diagrams/${fakeId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
    });
});
