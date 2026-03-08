/**
 * T049 — Integration tests for Global Edge Fleet and User Profile Stats/Password.
 * Tests: GET /api/admin/edge-servers, GET /api/users/me/stats, POST /api/users/me/password
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
let userToken: string;

beforeAll(async () => {
    await connectDatabase();
    await User.deleteMany({ email: /profile_test/ });

    // Setup Admin
    const admin = await AuthService.register('profile_test_admin@test.com', 'adminPass123');
    await User.updateOne({ _id: admin.user._id }, { role: 'ADMIN' });
    const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'profile_test_admin@test.com', password: 'adminPass123' });
    adminToken = (adminLogin.body as { data: { token: string } }).data.token;

    // Setup regular User
    const user = await AuthService.register('profile_test_user@test.com', 'userPass123');
    userToken = user.token;
});

afterAll(async () => {
    await User.deleteMany({ email: /profile_test/ });
    await disconnectDatabase();
});

// ── GET /api/admin/edge-servers ────────────────────────────────────────────

describe('T049a — Admin Global Edge Fleet', () => {
    it('returns 200 and an array for Admin', async () => {
        const res = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns 403 for regular User', async () => {
        const res = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(403);
    });

    it('does not expose apiKeyHash in the fleet list', async () => {
        const res = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        const servers = res.body.data as Array<Record<string, unknown>>;
        servers.forEach((s) => {
            expect(s['apiKeyHash']).toBeUndefined();
        });
    });
});

// ── GET /api/users/me/stats ────────────────────────────────────────────────

describe('T049b — User Stats', () => {
    it('returns 200 with diagramCount and edgeServerCount', async () => {
        const res = await request(app)
            .get('/api/users/me/stats')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            diagramCount: expect.any(Number),
            edgeServerCount: expect.any(Number),
        });
    });

    it('returns 401 for unauthenticated request', async () => {
        const res = await request(app).get('/api/users/me/stats');
        expect(res.status).toBe(401);
    });
});

// ── POST /api/users/me/password ────────────────────────────────────────────

describe('T049c — Change Password', () => {
    it('changes password successfully with correct currentPassword', async () => {
        // Register a fresh user for this test
        const { token } = await AuthService.register(
            'profile_test_pwchange@test.com',
            'oldPassword1',
        );

        const res = await request(app)
            .post('/api/users/me/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ currentPassword: 'oldPassword1', newPassword: 'newPassword2' });

        expect(res.status).toBe(200);

        // Verify new password works
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'profile_test_pwchange@test.com', password: 'newPassword2' });
        expect(loginRes.status).toBe(200);
    });

    it('returns 401 when currentPassword is wrong', async () => {
        const res = await request(app)
            .post('/api/users/me/password')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ currentPassword: 'WRONG_PASSWORD', newPassword: 'newPass99' });

        expect(res.status).toBe(401);
    });

    it('returns 400 when newPassword is too short', async () => {
        const res = await request(app)
            .post('/api/users/me/password')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ currentPassword: 'userPass123', newPassword: 'short' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when newPassword is missing', async () => {
        const res = await request(app)
            .post('/api/users/me/password')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ currentPassword: 'userPass123' });

        expect(res.status).toBe(400);
    });
});
