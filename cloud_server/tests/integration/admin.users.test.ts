/**
 * T048 — Integration tests for Admin User Management API (Phase 8).
 * Tests: GET /api/admin/users, PATCH /api/admin/users/:id/tier,
 *         PATCH /api/admin/users/:id/status
 *
 * Requires a running MongoDB at MONGO_URI.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app } from '../../src/app';
import { User } from '../../src/models/User';
import { Diagram } from '../../src/models/Diagram';
import { AuthService } from '../../src/services/auth.service';
import { DiagramQuotaService } from '../../src/services/diagram-quota.service';

// ── Lifecycle ─────────────────────────────────────────────────────────────

let adminToken: string;
let adminId: string;
let userId: string;
let userToken: string;

beforeAll(async () => {
    await connectDatabase();
    await User.deleteMany({ email: /admin_users_test/ });

    // Create an Admin user and a regular User for testing
    const admin = await AuthService.register('admin_users_test_admin@test.com', 'adminPass123');
    adminId = admin.user._id.toString();
    await User.updateOne({ _id: admin.user._id }, { role: 'ADMIN' });
    // Re-login to get a token with ADMIN role
    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin_users_test_admin@test.com', password: 'adminPass123' });
    adminToken = (loginRes.body as { data: { token: string } }).data.token;

    const regularUser = await AuthService.register('admin_users_test_user@test.com', 'userPass123');
    userId = String(regularUser.user._id);
    userToken = regularUser.token;
});

afterAll(async () => {
    await Diagram.deleteMany({ ownerId: { $in: [userId, adminId] } });
    await User.deleteMany({ email: /admin_users_test/ });
    await disconnectDatabase();
});

// ── GET /api/admin/users ────────────────────────────────────────────────────

describe('T048 — Admin User Management', () => {
    describe('GET /api/admin/users', () => {
        it('returns 200 and a paginated list for Admin', async () => {
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ status: 'success', total: expect.any(Number) });
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        it('returns 403 for a regular User', async () => {
            const { token } = await AuthService.register(
                'admin_users_test_nonAdmin@test.com',
                'pass12345',
            );
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
        });

        it('filters by search query', async () => {
            const res = await request(app)
                .get('/api/admin/users?search=admin_users_test_user')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.length).toBeGreaterThanOrEqual(1);
            expect((res.body.data as Array<{ email: string }>)[0].email).toContain('admin_users_test_user');
        });

        it('filters active USER candidates before pagination', async () => {
            const prefix = 'admin_users_test_assignment_filter';
            const active = await AuthService.register(`${prefix}_active@test.com`, 'pass12345');
            const banned = await AuthService.register(`${prefix}_banned@test.com`, 'pass12345');
            const deleted = await AuthService.register(`${prefix}_deleted@test.com`, 'pass12345');
            const excludedAdmin = await AuthService.register(`${prefix}_admin@test.com`, 'pass12345');

            await User.updateOne({ _id: banned.user._id }, { isBanned: true });
            await User.updateOne({ _id: deleted.user._id }, { isDeleted: true });
            await User.updateOne({ _id: excludedAdmin.user._id }, { role: 'ADMIN' });

            const res = await request(app)
                .get(`/api/admin/users?search=${prefix}&role=USER&activeOnly=true&page=1&limit=1`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                total: 1,
                page: 1,
                limit: 1,
                data: [{ _id: active.user._id.toString(), role: 'USER', isBanned: false, isDeleted: false }],
            });
        });

        it('does not return passwordHash in the list', async () => {
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            const users = res.body.data as Array<Record<string, unknown>>;
            users.forEach((u) => {
                expect(u['passwordHash']).toBeUndefined();
            });
        });
    });

    // ── PATCH /api/admin/users/:id/tier ────────────────────────────────────

    describe('PATCH /api/admin/users/:id/tier', () => {
        it('updates user tier to PRO', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${userId}/tier`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ tier: 'PRO' });

            expect(res.status).toBe(200);

            const updated = await User.findById(userId).lean();
            expect(updated?.subscriptionTier).toBe('PRO');
        });

        it('updates user tier back to FREE', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${userId}/tier`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ tier: 'FREE' });

            expect(res.status).toBe(200);

            const updated = await User.findById(userId).lean();
            expect(updated?.subscriptionTier).toBe('FREE');
        });

        it('reconciles the three newest diagrams on PRO-to-FREE downgrade and keeps excess blocking creation', async () => {
            await Diagram.deleteMany({ ownerId: userId });
            await User.updateOne({ _id: userId }, { subscriptionTier: 'PRO' });

            const baseTime = Date.now() - 10_000;
            const created = await Diagram.create(
                Array.from({ length: 5 }, (_, index) => ({
                    ownerId: userId,
                    name: `Downgrade ${index}`,
                    layout: {},
                    quotaSlot: index < 2 ? index + 1 : undefined,
                })),
            );
            for (let index = 0; index < created.length; index += 1) {
                await Diagram.updateOne(
                    { _id: created[index]!._id },
                    { $set: { updatedAt: new Date(baseTime + (created.length - index) * 1_000) } },
                    { timestamps: false },
                );
            }

            const res = await request(app)
                .patch(`/api/admin/users/${userId}/tier`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ tier: 'FREE' });

            expect(res.status).toBe(200);

            const diagrams = await Diagram.find({ ownerId: userId })
                .sort({ updatedAt: -1, _id: -1 })
                .lean();
            const slotted = diagrams.filter((diagram) => diagram.quotaSlot !== undefined);
            const excess = diagrams.filter((diagram) => diagram.quotaSlot === undefined);
            expect(new Set(slotted.map((diagram) => diagram.quotaSlot))).toEqual(new Set([1, 2, 3]));
            expect(new Set(slotted.map((diagram) => diagram.name))).toEqual(
                new Set(['Downgrade 0', 'Downgrade 1', 'Downgrade 2']),
            );
            expect(excess.map((diagram) => diagram.name).sort()).toEqual(['Downgrade 3', 'Downgrade 4']);

            const createRes = await request(app)
                .post('/api/diagrams')
                .set('Authorization', `Bearer ${userToken}`)
                .send({ name: 'Must remain blocked', layout: {} });

            expect(createRes.status).toBe(403);
            expect(await Diagram.countDocuments({ ownerId: userId })).toBe(5);
        });

        it('waits for an active create before starting tier reconciliation', async () => {
            await User.updateOne(
                { _id: userId },
                {
                    $set: {
                        subscriptionTier: 'PRO',
                        diagramQuotaActiveCreates: 1,
                        diagramQuotaMutationPending: false,
                    },
                },
            );

            let settled = false;
            const downgrade = request(app)
                .patch(`/api/admin/users/${userId}/tier`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ tier: 'FREE' })
                .then((response) => {
                    settled = true;
                    return response;
                });

            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(settled).toBe(false);

            await User.updateOne(
                { _id: userId },
                { $set: { diagramQuotaActiveCreates: 0 } },
            );

            const response = await downgrade;
            expect(response.status).toBe(200);
            expect((await User.findById(userId).lean())?.subscriptionTier).toBe('FREE');
        });

        it('reconciles existing owners through the migration-wide quota contract', async () => {
            await Diagram.deleteMany({ ownerId: { $in: [userId, adminId] } });
            await User.updateOne({ _id: userId }, { subscriptionTier: 'FREE' });
            await Diagram.create([
                { ownerId: userId, name: 'Migration FREE 0', layout: {}, quotaSlot: 1 },
                { ownerId: userId, name: 'Migration FREE 1', layout: {} },
                { ownerId: userId, name: 'Migration FREE 2', layout: {} },
                { ownerId: userId, name: 'Migration FREE excess', layout: {} },
                { ownerId: adminId, name: 'Migration Admin stale slot', layout: {}, quotaSlot: 1 },
            ]);

            const result = await DiagramQuotaService.reconcileAllQuotaSlots();

            const freeDiagrams = await Diagram.find({ ownerId: userId }).lean();
            const adminDiagram = await Diagram.findOne({ ownerId: adminId }).lean();
            expect(result.freeOwnersReconciled).toBeGreaterThanOrEqual(1);
            expect(freeDiagrams.filter((diagram) => diagram.quotaSlot !== undefined)).toHaveLength(3);
            expect(freeDiagrams.filter((diagram) => diagram.quotaSlot === undefined)).toHaveLength(1);
            expect(adminDiagram?.quotaSlot).toBeUndefined();
        });

        it('returns 400 for invalid tier value', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${userId}/tier`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ tier: 'ENTERPRISE' });

            expect(res.status).toBe(400);
        });

        it('returns 403 for non-Admin', async () => {
            const { token } = await AuthService.register(
                'admin_users_test_nonadmin2@test.com',
                'pass12345',
            );
            const res = await request(app)
                .patch(`/api/admin/users/${userId}/tier`)
                .set('Authorization', `Bearer ${token}`)
                .send({ tier: 'PRO' });

            expect(res.status).toBe(403);
        });
    });

    // ── PATCH /api/admin/users/:id/status ──────────────────────────────────

    describe('PATCH /api/admin/users/:id/status', () => {
        it('bans a user (isBanned: true)', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${userId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isBanned: true });

            expect(res.status).toBe(200);

            const updated = await User.findById(userId).lean();
            expect(updated?.isBanned).toBe(true);
        });

        it('banned user receives 401 on authenticated request', async () => {
            // Login as the user BEFORE banning
            const { token: userToken } = await AuthService.register(
                'admin_users_test_tobanned@test.com',
                'pass12345',
            );
            const bannedUser = await User.findOne({ email: 'admin_users_test_tobanned@test.com' });

            // Ban via API
            await request(app)
                .patch(`/api/admin/users/${String(bannedUser!._id)}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isBanned: true });

            // Attempt to use the (still-valid JWT) token after ban
            const res = await request(app)
                .get('/api/diagrams')
                .set('Authorization', `Bearer ${userToken}`);

            expect(res.status).toBe(401);
        });

        it('unbans a user (isBanned: false)', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${userId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isBanned: false });

            expect(res.status).toBe(200);

            const updated = await User.findById(userId).lean();
            expect(updated?.isBanned).toBe(false);
        });

        it('returns 400 for non-boolean isBanned', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${userId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isBanned: 'yes' });

            expect(res.status).toBe(400);
        });
    });
});
