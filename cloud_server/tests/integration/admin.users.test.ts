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
import { AuthService } from '../../src/services/auth.service';

// ── Lifecycle ─────────────────────────────────────────────────────────────

let adminToken: string;
let userId: string;

beforeAll(async () => {
    await connectDatabase();
    await User.deleteMany({ email: /admin_users_test/ });

    // Create an Admin user and a regular User for testing
    const admin = await AuthService.register('admin_users_test_admin@test.com', 'adminPass123');
    await User.updateOne({ _id: admin.user._id }, { role: 'ADMIN' });
    // Re-login to get a token with ADMIN role
    const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin_users_test_admin@test.com', password: 'adminPass123' });
    adminToken = (loginRes.body as { data: { token: string } }).data.token;

    const regularUser = await AuthService.register('admin_users_test_user@test.com', 'userPass123');
    userId = String(regularUser.user._id);
});

afterAll(async () => {
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
