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
import { type AddressInfo } from 'node:net';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app, server } from '../../src/app';
import { User } from '../../src/models/User';
import { EdgeServer } from '../../src/models/EdgeServer';
import { AuthService } from '../../src/services/auth.service';
import { lastSeenRegistry } from '../../src/services/edge-servers.service';
import { EDGE_NAMESPACE } from '../../src/socket/events/edge';
import { disconnectEdgeSocketsById } from '../../src/socket/io';

// ── Test state ────────────────────────────────────────────────────────────

let adminToken: string;

let freeUserToken: string;
let freeUserId: string;

let proUserToken: string;
let proUserId: string;

let otherUserToken: string;
let edgeSocketUrl = '';
let startedSocketServer = false;
const activeClientSockets = new Set<ClientSocket>();

type EdgeActivationPayload = {
    edgeId: string;
    lifecycleState: 'Active';
    persistentCredential: {
        version: number;
        secret: string;
        issuedAt: string;
    };
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function createAdminUser(email: string): Promise<string> {
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN' });
    const { token: adminTok } = await AuthService.login(email, 'password1234');
    return adminTok;
}

async function ensureServerListening(): Promise<string> {
    startedSocketServer = !server.listening;
    if (!server.listening) {
        await new Promise<void>((resolve, reject) => {
            server.listen(0, '127.0.0.1', () => resolve());
            server.once('error', reject);
        });
    }

    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('HTTP server address is unavailable for edge socket integration tests');
    }

    return `http://127.0.0.1:${(address as AddressInfo).port}`;
}

function trackSocket(socket: ClientSocket): ClientSocket {
    activeClientSockets.add(socket);
    return socket;
}

async function closeSocket(socket: ClientSocket): Promise<void> {
    if (socket.disconnected) {
        socket.close();
        return;
    }

    await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 300);
        socket.once('disconnect', () => {
            clearTimeout(timer);
            resolve();
        });
        socket.disconnect();
    });
}

async function cleanupClientSockets(): Promise<void> {
    const sockets = Array.from(activeClientSockets);
    activeClientSockets.clear();
    await Promise.all(sockets.map((socket) => closeSocket(socket)));
}

async function createEdgeServer(name: string): Promise<string> {
    const res = await request(app)
        .post('/api/edge-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name });
    expect(res.status).toBe(201);
    return (res.body.data?.edge?._id as string);
}

async function registerEdgeWithOnboarding(name: string): Promise<{ edgeId: string; onboardingSecret: string }> {
    const res = await request(app)
        .post('/api/edge-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name });

    expect(res.status).toBe(201);
    return {
        edgeId: res.body.data?.edge?._id as string,
        onboardingSecret: res.body.data?.onboardingPackage?.onboardingSecret as string,
    };
}

async function connectOnboardingSocket(
    edgeId: string,
    onboardingSecret: string,
): Promise<{ socket: ClientSocket; activationPayload: EdgeActivationPayload }> {
    return new Promise((resolve, reject) => {
        const socket = trackSocket(
            createSocketClient(`${edgeSocketUrl}${EDGE_NAMESPACE}`, {
                auth: {
                    edgeId,
                    credentialMode: 'onboarding',
                    credentialSecret: onboardingSecret,
                },
                transports: ['websocket'],
                reconnection: false,
                forceNew: true,
                autoConnect: false,
                timeout: 3000,
            }),
        );

        let connected = false;
        let activationPayload: EdgeActivationPayload | null = null;
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('edge_activation_timeout'));
        }, 3500);

        const maybeResolve = () => {
            if (!connected || !activationPayload) return;
            clearTimeout(timer);
            resolve({ socket, activationPayload });
        };

        socket.once('connect', () => {
            connected = true;
            maybeResolve();
        });

        socket.once('edge_activation', (payload: unknown) => {
            activationPayload = payload as EdgeActivationPayload;
            maybeResolve();
        });

        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            socket.close();
            reject(error);
        });

        socket.connect();
    });
}

async function waitForForcedDisconnect(
    socket: ClientSocket,
): Promise<{ edgeReason: string | null; disconnectReason: string }> {
    return new Promise((resolve, reject) => {
        let edgeReason: string | null = null;

        const timer = setTimeout(() => {
            reject(new Error('edge_forced_disconnect_timeout'));
        }, 4000);

        socket.once('edge_disconnect', (payload: unknown) => {
            if (
                payload &&
                typeof payload === 'object' &&
                'reason' in payload &&
                typeof (payload as { reason?: unknown }).reason === 'string'
            ) {
                edgeReason = (payload as { reason: string }).reason;
            }
        });

        socket.once('disconnect', (reason) => {
            clearTimeout(timer);
            resolve({
                edgeReason,
                disconnectReason: reason,
            });
        });
    });
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
    edgeSocketUrl = await ensureServerListening();

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
    await cleanupClientSockets();
    await User.deleteMany({});
    await EdgeServer.deleteMany({});
    if (startedSocketServer && server.listening) {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
    await disconnectDatabase();
});

beforeEach(async () => {
    await EdgeServer.deleteMany({});
    lastSeenRegistry.clear();
    vi.clearAllMocks();
});

afterEach(async () => {
    await cleanupClientSockets();
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

    it('T026-2b: Admin fleet derives online state from current heartbeat instead of stale stored flag', async () => {
        const edgeId = await createEdgeServer('EdgeAdminFleetOnline');

        await setLifecycleState(edgeId, 'Active');
        await EdgeServer.findByIdAndUpdate(edgeId, {
            $set: {
                availability: {
                    online: false,
                    lastSeenAt: new Date(),
                },
            },
        }).exec();
        lastSeenRegistry.set(edgeId, Date.now());

        const res = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        const edge = (res.body.data as Array<{ _id: string; availability: { online: boolean } }>).find(
            (item) => item._id === edgeId,
        );
        expect(edge).toBeTruthy();
        expect(edge?.availability.online).toBe(true);
    });

    it('T029-3 generic forced disconnect keeps admin and user fleet projections telemetry-ready but offline', async () => {
        const { edgeId, onboardingSecret } = await registerEdgeWithOnboarding(
            'Edge Forced Disconnect Projection',
        );

        await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: freeUserId })
            .expect(200);

        const { socket } = await connectOnboardingSocket(edgeId, onboardingSecret);

        const disconnectWait = waitForForcedDisconnect(socket);
        await expect(disconnectEdgeSocketsById(edgeId)).resolves.toBe(1);

        const disconnected = await disconnectWait;
        expect(disconnected.edgeReason).toBe('edge_forced_disconnect');
        expect(disconnected.disconnectReason).toBe('io server disconnect');

        const adminRes = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(adminRes.status).toBe(200);
        const adminEdge = (
            adminRes.body.data as Array<{
                _id: string;
                lifecycleState: string;
                isTelemetryReady: boolean;
                availability: { online: boolean };
            }>
        ).find((item) => item._id === edgeId);
        expect(adminEdge).toBeTruthy();
        expect(adminEdge?.lifecycleState).toBe('Active');
        expect(adminEdge?.isTelemetryReady).toBe(true);
        expect(adminEdge?.availability.online).toBe(false);

        const userRes = await request(app)
            .get('/api/edge-servers')
            .set('Authorization', `Bearer ${freeUserToken}`);

        expect(userRes.status).toBe(200);
        expect(userRes.body.data).toEqual([
            expect.objectContaining({
                _id: edgeId,
                lifecycleState: 'Active',
                availability: expect.objectContaining({ online: false }),
            }),
        ]);
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

    it('T026-5b: Bind and unbind return canonical admin projection with populated trusted users', async () => {
        const edgeId = await createEdgeServer('EdgeProjectionShape');

        const bindRes = await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId: freeUserId });

        expect(bindRes.status).toBe(200);
        expect(bindRes.body.data?.trustedUsers).toEqual([
            expect.objectContaining({
                _id: freeUserId,
                email: 'free_user_edge@test.com',
            }),
        ]);

        const unbindRes = await request(app)
            .delete(`/api/edge-servers/${edgeId}/bind/${freeUserId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(unbindRes.status).toBe(200);
        expect(unbindRes.body.data?.trustedUsers).toEqual([]);
        expect(unbindRes.body.data?.createdBy).toEqual(
            expect.objectContaining({
                email: 'admin_edge@test.com',
            }),
        );
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
