/**
 * T049 - Integration tests for global edge fleet and user profile self-service.
 * Covers:
 * - GET /api/admin/edge-servers
 * - GET /api/users/me
 * - GET /api/users/me/stats
 * - PATCH /api/users/me/password
 *
 * Requires a running MongoDB at MONGO_URI.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app } from '../../src/app';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/services/auth.service';

let adminToken: string;
let userToken: string;
let userId: string;

beforeAll(async () => {
    await connectDatabase();
    await User.deleteMany({ email: /profile_test/ });

    const admin = await AuthService.register('profile_test_admin@test.com', 'adminPass123');
    await User.updateOne({ _id: admin.user._id }, { role: 'ADMIN' });
    const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'profile_test_admin@test.com', password: 'adminPass123' });
    adminToken = (adminLogin.body as { data: { token: string } }).data.token;

    const user = await AuthService.register('profile_test_user@test.com', 'userPass123');
    userToken = user.token;
    userId = user.user._id.toString();
});

afterAll(async () => {
    await User.deleteMany({ email: /profile_test/ });
    await disconnectDatabase();
});

describe('T049a - Admin global edge fleet', () => {
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

    it('does not expose credential secret fields in the fleet list', async () => {
        const res = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        const servers = res.body.data as Array<Record<string, unknown>>;
        servers.forEach((server) => {
            expect(server['persistentCredential']).toBeUndefined();
            expect(server['onboardingSecret']).toBeUndefined();
            const currentOnboardingPackage =
                server['currentOnboardingPackage'] as Record<string, unknown> | null | undefined;
            expect(currentOnboardingPackage?.['secretHash']).toBeUndefined();
        });
    });
});

describe('T049b0 - User profile', () => {
    it('returns current user identity and subscription tier from the database', async () => {
        const res = await request(app)
            .get('/api/users/me')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            _id: userId,
            email: 'profile_test_user@test.com',
            role: 'USER',
            subscriptionTier: 'FREE',
        });
        expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('returns the latest subscription tier even when the JWT snapshot is stale', async () => {
        await User.updateOne({ _id: userId }, { subscriptionTier: 'PRO' }).exec();

        const res = await request(app)
            .get('/api/users/me')
            .set('Authorization', `Bearer ${userToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.subscriptionTier).toBe('PRO');

        await User.updateOne({ _id: userId }, { subscriptionTier: 'FREE' }).exec();
    });
});

describe('T049b - User stats', () => {
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

    it('counts only lifecycle Active edges in user stats even when non-Active edges look available', async () => {
        await EdgeServer.deleteMany({ name: /^profile_test_t033_/ }).exec();

        await EdgeServer.create({
            name: 'profile_test_t033_active_edge',
            lifecycleState: 'Active',
            trustedUsers: [userId],
            availability: { online: true, lastSeenAt: new Date('2026-03-29T00:00:00.000Z') },
            currentOnboardingPackage: {
                credentialId: 'profile-test-t033-active-onboarding',
                secretHash: 'profile_test_t033_onboarding_hash',
                displayHint: 'prof...hash',
                issuedAt: new Date('2026-03-28T00:00:00.000Z'),
                expiresAt: new Date('2026-03-29T00:00:00.000Z'),
                issuedBy: null,
                status: 'used',
                usedAt: new Date('2026-03-28T00:10:00.000Z'),
                supersededByCredentialId: null,
            },
            persistentCredential: {
                version: 1,
                secretHash: 'profile_test_t033_persistent_hash',
                issuedAt: new Date('2026-03-28T00:30:00.000Z'),
                lastAcceptedAt: null,
                revokedAt: null,
                revocationReason: null,
            },
        });

        await EdgeServer.create({
            name: 'profile_test_t033_reonboarding_edge',
            lifecycleState: 'Re-onboarding Required',
            trustedUsers: [userId],
            availability: { online: true, lastSeenAt: new Date('2026-03-29T01:00:00.000Z') },
            currentOnboardingPackage: {
                credentialId: 'profile-test-t033-reonboarding-onboarding',
                secretHash: 'profile_test_t033_reonboarding_pkg_hash',
                displayHint: 'prof...reonb',
                issuedAt: new Date('2026-03-28T01:00:00.000Z'),
                expiresAt: new Date('2026-03-29T01:00:00.000Z'),
                issuedBy: null,
                status: 'ready',
                usedAt: null,
                supersededByCredentialId: null,
            },
            persistentCredential: null,
        });

        const statsResponse = await request(app)
            .get('/api/users/me/stats')
            .set('Authorization', `Bearer ${userToken}`);

        expect(statsResponse.status).toBe(200);
        expect(statsResponse.body.data?.edgeServerCount).toBe(1);

        await EdgeServer.deleteMany({ name: /^profile_test_t033_/ }).exec();
    });
});

describe('T049c - Change password', () => {
    it('changes password successfully with correct currentPassword via PATCH', async () => {
        const { token } = await AuthService.register(
            'profile_test_pwchange@test.com',
            'oldPassword1',
        );

        const res = await request(app)
            .patch('/api/users/me/password')
            .set('Authorization', `Bearer ${token}`)
            .send({ currentPassword: 'oldPassword1', newPassword: 'newPassword2' });

        expect(res.status).toBe(200);

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'profile_test_pwchange@test.com', password: 'newPassword2' });
        expect(loginRes.status).toBe(200);
    });

    it('returns 401 when currentPassword is wrong', async () => {
        const res = await request(app)
            .patch('/api/users/me/password')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ currentPassword: 'WRONG_PASSWORD', newPassword: 'newPass99' });

        expect(res.status).toBe(401);
    });

    it('returns 400 when newPassword is too short', async () => {
        const res = await request(app)
            .patch('/api/users/me/password')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ currentPassword: 'userPass123', newPassword: 'short' });

        expect(res.status).toBe(400);
    });

    it('returns 400 when newPassword is missing', async () => {
        const res = await request(app)
            .patch('/api/users/me/password')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ currentPassword: 'userPass123' });

        expect(res.status).toBe(400);
    });
});
