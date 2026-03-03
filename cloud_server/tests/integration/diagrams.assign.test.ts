/**
 * Integration tests for Admin Diagram Assignment (US2b).
 * T022d — POST /api/diagrams/:id/assign
 *
 * Scenarios:
 *   1. Admin can assign their own diagram to another user (200)
 *   2. Admin cannot assign a diagram they don't own (403)
 *   3. Non-admin user gets 403 (Insufficient permissions)
 *   4. Missing targetUserId body → 400
 *   5. DiagramBindings remain with original owner after assignment
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

let adminToken: string;
let adminId: string;

let otherAdminToken: string;

let regularUserToken: string;
let regularUserId: string;

// ── Helpers ───────────────────────────────────────────────────────────────

async function createAdminUser(email: string): Promise<{ token: string; userId: string }> {
    // Register then force role to ADMIN directly in DB
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN' });
    // Re-login to get token with ADMIN role embedded
    const { token: adminToken } = await AuthService.login(email, 'password1234');
    return { token: adminToken, userId: user._id.toString() };
}

async function createDiagram(ownerId: string, name = 'Test Diagram') {
    return Diagram.create({
        ownerId: new mongoose.Types.ObjectId(ownerId),
        name,
        layout: { widgets: [] },
    });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeAll(async () => {
    await connectDatabase();
    await User.deleteMany({});
    await Diagram.deleteMany({});
    await DiagramBindings.deleteMany({});

    // Create admin user
    ({ token: adminToken, userId: adminId } = await createAdminUser('admin_assign@test.com'));

    // Create second admin (owns nothing — used to test 403 on un-owned diagrams)
    ({ token: otherAdminToken } = await createAdminUser('other_admin@test.com'));

    // Create regular user (target for assignment)
    const result = await AuthService.register('regular_assign@test.com', 'password1234');
    regularUserToken = result.token;
    regularUserId = result.user._id.toString();
});

afterAll(async () => {
    await User.deleteMany({});
    await Diagram.deleteMany({});
    await DiagramBindings.deleteMany({});
    await disconnectDatabase();
});

beforeEach(async () => {
    await Diagram.deleteMany({});
    await DiagramBindings.deleteMany({});
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('T022d — POST /api/diagrams/:id/assign (Admin only)', () => {

    it('should transfer ownership when Admin assigns their own diagram (200)', async () => {
        const diagram = await createDiagram(adminId, 'Admin Owned');

        const res = await request(app)
            .post(`/api/diagrams/${diagram._id.toString()}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ targetUserId: regularUserId });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');

        // Verify DB: ownerId changed to regular user
        const updated = await Diagram.findById(diagram._id).lean();
        expect(updated?.ownerId.toString()).toBe(regularUserId);
    });

    it('should return 403 when Admin tries to assign a diagram they do NOT own', async () => {
        // Diagram is owned by adminId, not otherAdminId
        const diagram = await createDiagram(adminId, 'Not OtherAdmin Owned');

        const res = await request(app)
            .post(`/api/diagrams/${diagram._id.toString()}/assign`)
            .set('Authorization', `Bearer ${otherAdminToken}`)
            .send({ targetUserId: regularUserId });

        expect(res.status).toBe(403);

        // Verify DB: ownerId unchanged
        const unchanged = await Diagram.findById(diagram._id).lean();
        expect(unchanged?.ownerId.toString()).toBe(adminId);
    });

    it('should return 403 when a regular USER tries to assign (role guard)', async () => {
        const diagram = await createDiagram(regularUserId, 'Regular User Diagram');

        const res = await request(app)
            .post(`/api/diagrams/${diagram._id.toString()}/assign`)
            .set('Authorization', `Bearer ${regularUserToken}`)
            .send({ targetUserId: adminId });

        expect(res.status).toBe(403);
    });

    it('should return 400 when targetUserId is missing from body', async () => {
        const diagram = await createDiagram(adminId, 'Admin Diagram');

        const res = await request(app)
            .post(`/api/diagrams/${diagram._id.toString()}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({}); // no targetUserId

        expect(res.status).toBe(400);
    });

    it('should return 401 when request has no auth token', async () => {
        const diagram = await createDiagram(adminId, 'Admin Diagram No Auth');

        const res = await request(app)
            .post(`/api/diagrams/${diagram._id.toString()}/assign`)
            .send({ targetUserId: regularUserId });

        expect(res.status).toBe(401);
    });

    it('DiagramBindings should NOT be transferred — remain associated with original owner', async () => {
        const diagram = await createDiagram(adminId, 'Diagram With Bindings');
        const fakeEdgeId = new mongoose.Types.ObjectId();

        // Create a binding for this diagram
        await DiagramBindings.create({
            diagramId: diagram._id,
            ownerId: new mongoose.Types.ObjectId(adminId),
            edgeServerId: fakeEdgeId,
            widgetBindings: [{ widgetId: 'w1', deviceId: 'd1', metric: 'temp' }],
        });

        // Assign diagram to regular user
        const res = await request(app)
            .post(`/api/diagrams/${diagram._id.toString()}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ targetUserId: regularUserId });

        expect(res.status).toBe(200);

        // Bindings still exist and still reference the original ownerId (adminId)
        const bindings = await DiagramBindings.find({ diagramId: diagram._id }).lean();
        expect(bindings).toHaveLength(1);
        expect(bindings[0]!.ownerId.toString()).toBe(adminId);
    });
});
