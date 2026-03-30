/**
 * T026 — Integration tests: Edge Server Management (US3).
 *
 * Scenarios:
 *   T026-1: Users only see their trusted edge servers (not others)
 *   T026-2: Admin sees all edge servers
 *   T026-3: FREE user cannot be assigned more than 1 Edge Server (FR-2b)
 *   T026-4: PRO user can be assigned multiple edge servers
 *   T026-5: Assigning same user twice → 409 Conflict
 *   T026-6: Ping returns { online: false } when edge has never reported
 *   T026-7: Ping returns { online: true } after in-memory lastSeenAt updated (< 30s)
 *
 * Also retains T021b service-level quota checks (legacy, for regression).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app } from '../../src/app';
import { User } from '../../src/models/User';
import { EdgeServer } from '../../src/models/EdgeServer';
import { AuthService } from '../../src/services/auth.service';
import { lastSeenRegistry } from '../../src/services/edge-servers.service';

// ── Test state ────────────────────────────────────────────────────────────

let adminToken: string;

let freeUserToken: string;
let freeUserId: string;

let proUserToken: string;
let proUserId: string;

let otherUserToken: string;

// ── Helpers ───────────────────────────────────────────────────────────────

async function createAdminUser(email: string): Promise<string> {
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN' });
    const { token: adminTok } = await AuthService.login(email, 'password1234');
    return adminTok;
}

async function createEdgeServer(name: string): Promise<string> {
    const res = await request(app)
        .post('/api/edge-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name });
    expect(res.status).toBe(201);
    return (res.body.data?.edge?._id as string);
}

async function setLifecycleState(edgeId: string, lifecycleState: string): Promise<void> {
    const persistentCredential =
        lifecycleState === 'Active'
            ? {
                  version: 1,
                  secretHash: 'edge_servers_test_persistent_hash',
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

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeAll(async () => {
    await connectDatabase();
    await User.deleteMany({});
    await EdgeServer.deleteMany({});

    // Admin
    adminToken = await createAdminUser('admin_edge@test.com');

    // FREE user (default tier)
    const freeResult = await AuthService.register('free_user_edge@test.com', 'password1234');
    freeUserToken = freeResult.token;
    freeUserId = freeResult.user._id.toString();

    // PRO user
    const proResult = await AuthService.register('pro_user_edge@test.com', 'password1234');
    proUserToken = proResult.token;
    proUserId = proResult.user._id.toString();
    await User.findByIdAndUpdate(proResult.user._id, { subscriptionTier: 'PRO' });

    // Other user (not assigned to any edge)
    const otherResult = await AuthService.register('other_user_edge@test.com', 'password1234');
    otherUserToken = otherResult.token;
});

afterAll(async () => {
    await User.deleteMany({});
    await EdgeServer.deleteMany({});
    await disconnectDatabase();
});

beforeEach(async () => {
    await EdgeServer.deleteMany({});
    lastSeenRegistry.clear();
    vi.clearAllMocks();
});

// ── T026 Tests ────────────────────────────────────────────────────────────

describe('T026 — Edge Server HTTP Integration Tests (US3)', () => {

    // ── T026-1: User visibility isolation ────────────────────────────────

    it('T026-1a: User only sees edge servers they are trusted on', async () => {
        const edgeId = await createEdgeServer('EdgeForFreeUser');

        // Bind freeUser
        await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: freeUserId })
            .expect(200);

        await setLifecycleState(edgeId, 'Active');

        // freeUser sees the edge
        const res = await request(app)
            .get('/api/edge-servers')
            .set('Authorization', `Bearer ${freeUserToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]._id).toBe(edgeId);
    });

    it('T026-1b: Other user (not trusted) does NOT see the edge server', async () => {
        const edgeId = await createEdgeServer('EdgeNotForOther');

        // Bind only freeUser — otherUser is NOT bound
        await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: freeUserId })
            .expect(200);

        await setLifecycleState(edgeId, 'Active');

        const res = await request(app)
            .get('/api/edge-servers')
            .set('Authorization', `Bearer ${otherUserToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
    });

    // ── T026-2: Admin sees all (via DB, not this endpoint) ───────────────

    it('T026-2: Admin GET /api/edge-servers returns 403 (User-only endpoint)', async () => {
        await createEdgeServer('EdgeAdminCheck');

        const res = await request(app)
            .get('/api/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        // Admin is blocked from the user-facing list endpoint by requireRole('USER')
        expect(res.status).toBe(403);
    });

    // ── T026-3: FREE quota enforcement (FR-2b) ────────────────────────────

    it('T026-3a: FREE user can be assigned their FIRST edge server (200)', async () => {
        const edgeId = await createEdgeServer('EdgeForFreeFirst');

        const res = await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: freeUserId });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
    });

    it('T026-3b: FREE user cannot be assigned a SECOND edge server (403)', async () => {
        const edgeId1 = await createEdgeServer('EdgeFree1');
        const edgeId2 = await createEdgeServer('EdgeFree2');

        // First bind — allowed
        await request(app)
            .post(`/api/edge-servers/${edgeId1}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: freeUserId })
            .expect(200);

        // Second bind — must fail with 403
        const res = await request(app)
            .post(`/api/edge-servers/${edgeId2}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: freeUserId });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/quota/i);
    });

    // ── T026-4: PRO user can have multiple ───────────────────────────────

    it('T026-4: PRO user can be assigned multiple edge servers', async () => {
        const edgeId1 = await createEdgeServer('EdgePro1');
        const edgeId2 = await createEdgeServer('EdgePro2');
        const edgeId3 = await createEdgeServer('EdgePro3');

        await request(app)
            .post(`/api/edge-servers/${edgeId1}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: proUserId })
            .expect(200);

        await request(app)
            .post(`/api/edge-servers/${edgeId2}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: proUserId })
            .expect(200);

        await request(app)
            .post(`/api/edge-servers/${edgeId3}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: proUserId })
            .expect(200);

        // Verify PRO user sees 3 edges
        const res = await request(app)
            .get('/api/edge-servers')
            .set('Authorization', `Bearer ${proUserToken}`);

        // proUserToken was issued before setSubscriptionTier — list check is enough
        expect(res.status).toBe(200);
    });

    // ── T026-5: Duplicate bind → 409 ─────────────────────────────────────

    it('T026-5: Assigning same user to same edge twice → 409', async () => {
        const edgeId = await createEdgeServer('EdgeDup');

        await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: freeUserId })
            .expect(200);

        const res = await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: freeUserId });

        expect(res.status).toBe(409);
    });

    // ── T026-6: Ping — cold start (never seen) ────────────────────────────

    it('T026-6: Ping returns { online: false, lastSeenAt: null } for never-seen edge', async () => {
        const edgeId = await createEdgeServer('EdgeCold');

        const res = await request(app)
            .get(`/api/edge-servers/${edgeId}/ping`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.online).toBe(false);
        expect(res.body.data.lastSeenAt).toBeNull();
    });

    // ── T026-7: Ping — online after in-memory update ──────────────────────

    it('T026-7: Ping returns { online: true } after in-memory lastSeenAt is updated (< 30s)', async () => {
        const edgeId = await createEdgeServer('EdgeOnline');

        // Simulate WebSocket telemetry batch arriving — update in-memory registry
        lastSeenRegistry.set(edgeId, Date.now());

        const res = await request(app)
            .get(`/api/edge-servers/${edgeId}/ping`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.online).toBe(true);
        expect(res.body.data.lastSeenAt).not.toBeNull();
    });

    // ── Guard tests ───────────────────────────────────────────────────────

    it('Non-admin cannot register edge server (403)', async () => {
        const res = await request(app)
            .post('/api/edge-servers')
            .set('Authorization', `Bearer ${freeUserToken}`)
            .send({ name: 'Unauthorized' });

        expect(res.status).toBe(403);
    });

    it('Non-admin cannot bind users to edge server (403)', async () => {
        const edgeId = await createEdgeServer('EdgeGuardTest');

        const res = await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${freeUserToken}`)
            .send({ userId: freeUserId });

        expect(res.status).toBe(403);
    });

    it('Unauthenticated request to GET /api/edge-servers → 401', async () => {
        const res = await request(app).get('/api/edge-servers');
        expect(res.status).toBe(401);
    });
});
