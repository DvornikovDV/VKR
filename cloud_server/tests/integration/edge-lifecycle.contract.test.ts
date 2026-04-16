import { type AddressInfo } from 'node:net';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, server } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/services/auth.service';
import { EDGE_NAMESPACE } from '../../src/socket/events/edge';

let adminToken = '';
let edgeSocketUrl = '';
let startedSocketServer = false;
const activeClientSockets = new Set<ClientSocket>();

type EdgeRegisterResponse = {
    status: 'success';
    data?: {
        edge?: {
            _id?: string;
            lifecycleState?: 'Active' | 'Blocked';
            availability?: {
                online?: boolean;
                lastSeenAt?: string | null;
            };
        };
        persistentCredential?: {
            credentialSecret?: string;
            version?: number;
        };
    };
};

async function createAdminToken(email: string): Promise<string> {
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN', subscriptionTier: 'PRO' }).exec();
    const login = await AuthService.login(email, 'password1234');
    return login.token;
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

async function registerEdge(name: string): Promise<{
    edgeId: string;
    credentialSecret: string;
    credentialVersion: number;
}> {
    const response = await request(app)
        .post('/api/edge-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name });

    expect(response.status).toBe(201);

    const body = response.body as EdgeRegisterResponse;
    const edgeId = body.data?.edge?._id;
    const credentialSecret = body.data?.persistentCredential?.credentialSecret;
    const credentialVersion = body.data?.persistentCredential?.version;

    expect(edgeId).toBeTruthy();
    expect(credentialSecret).toBeTruthy();
    expect(typeof credentialVersion).toBe('number');

    return {
        edgeId: edgeId as string,
        credentialSecret: credentialSecret as string,
        credentialVersion: credentialVersion as number,
    };
}

async function connectEdgeSocket(auth: Record<string, unknown>): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
        const socket = trackSocket(
            createSocketClient(`${edgeSocketUrl}${EDGE_NAMESPACE}`, {
                auth,
                transports: ['websocket'],
                reconnection: false,
                forceNew: true,
                autoConnect: false,
                timeout: 3000,
            }),
        );

        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('edge_socket_connect_timeout'));
        }, 3500);

        socket.once('connect', () => {
            clearTimeout(timer);
            resolve(socket);
        });

        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            socket.close();
            reject(error);
        });

        socket.connect();
    });
}

async function connectEdgeExpectError(auth: Record<string, unknown>): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const socket = trackSocket(
            createSocketClient(`${edgeSocketUrl}${EDGE_NAMESPACE}`, {
                auth,
                transports: ['websocket'],
                reconnection: false,
                forceNew: true,
                autoConnect: false,
                timeout: 3000,
            }),
        );

        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('edge_socket_connect_error_timeout'));
        }, 3500);

        socket.once('connect', () => {
            clearTimeout(timer);
            socket.close();
            reject(new Error('expected_connect_error_but_connected'));
        });

        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            const message = error instanceof Error ? error.message : String(error);
            socket.close();
            resolve(message);
        });

        socket.connect();
    });
}

async function waitForForcedDisconnect(
    socket: ClientSocket,
): Promise<{ edgeReason: string | null; disconnectReason: string }> {
    return new Promise((resolve, reject) => {
        let edgeReason: string | null = null;
        const timer = setTimeout(() => reject(new Error('edge_forced_disconnect_timeout')), 4000);

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

describe('Edge runtime lifecycle contract (persistent-only auth)', () => {
    beforeAll(async () => {
        await connectDatabase();
        await User.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        edgeSocketUrl = await ensureServerListening();
        adminToken = await createAdminToken('admin_edge_lifecycle_contract@test.com');
    });

    beforeEach(async () => {
        await EdgeServer.deleteMany({}).exec();
    });

    afterEach(async () => {
        await cleanupClientSockets();
    });

    afterAll(async () => {
        await cleanupClientSockets();
        await User.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
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

    it('registers edge as Active + offline and discloses only the first persistent credential', async () => {
        const response = await request(app)
            .post('/api/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Edge Register Contract' });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('success');
        expect(response.body.data?.edge?.lifecycleState).toBe('Active');
        expect(response.body.data?.edge?.availability).toEqual({
            online: false,
            lastSeenAt: null,
        });

        const credentialSecret = response.body.data?.persistentCredential?.credentialSecret;
        expect(typeof credentialSecret).toBe('string');
        expect((credentialSecret as string).length).toBeGreaterThan(20);

        const fleet = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(fleet.status).toBe(200);
        const edge = (fleet.body.data as Array<Record<string, unknown>>)[0];
        expect(edge).toBeTruthy();
        expect(edge['persistentCredentialVersion']).toBe(1);
        expect(edge['persistentCredential']).toBeUndefined();
        expect(JSON.stringify(edge)).not.toContain(credentialSecret as string);
    });

    it('rejects removed legacy routes and legacy handshake shape', async () => {
        const registered = await registerEdge('Edge Legacy Surface Rejection');

        await request(app)
            .post(`/api/edge-servers/${registered.edgeId}/onboarding/reset`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({})
            .expect(404);

        await request(app)
            .post(`/api/edge-servers/${registered.edgeId}/trust/revoke`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({})
            .expect(404);

        await request(app)
            .post(`/api/edge-servers/${registered.edgeId}/re-enable-onboarding`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({})
            .expect(404);

        const connectError = await connectEdgeExpectError({
            edgeId: registered.edgeId,
            credentialMode: 'onboarding',
            credentialSecret: registered.credentialSecret,
        });
        expect(connectError).toBe('invalid_credential');
    });

    it('accepts trusted connect only with current persistent credential', async () => {
        const registered = await registerEdge('Edge Persistent Connect Contract');

        const socket = await connectEdgeSocket({
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });
        expect(socket.connected).toBe(true);
        await closeSocket(socket);

        const wrongSecretError = await connectEdgeExpectError({
            edgeId: registered.edgeId,
            credentialSecret: 'wrong-secret',
        });
        expect(wrongSecretError).toBe('invalid_credential');
    });

    it('rotate invalidates old credential and disconnects active trusted session', async () => {
        const registered = await registerEdge('Edge Rotate Contract');

        const socket = await connectEdgeSocket({
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });

        const forcedDisconnect = waitForForcedDisconnect(socket);
        const rotateResponse = await request(app)
            .post(`/api/edge-servers/${registered.edgeId}/rotate-credential`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        expect(rotateResponse.status).toBe(200);
        expect(rotateResponse.body.data?.edge?.lifecycleState).toBe('Active');
        expect(rotateResponse.body.data?.persistentCredential?.version).toBe(
            registered.credentialVersion + 1,
        );

        await expect(forcedDisconnect).resolves.toEqual({
            edgeReason: 'credential_rotated',
            disconnectReason: 'io server disconnect',
        });

        const oldCredentialError = await connectEdgeExpectError({
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });
        expect(oldCredentialError).toBe('invalid_credential');

        const nextSecret = rotateResponse.body.data?.persistentCredential?.credentialSecret as string;
        const reconnected = await connectEdgeSocket({
            edgeId: registered.edgeId,
            credentialSecret: nextSecret,
        });
        expect(reconnected.connected).toBe(true);
        await closeSocket(reconnected);
    });

    it('block prevents reconnect and unblock re-opens trusted path with a new credential', async () => {
        const registered = await registerEdge('Edge Block Unblock Contract');

        const socket = await connectEdgeSocket({
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });

        const forcedDisconnect = waitForForcedDisconnect(socket);
        const blockResponse = await request(app)
            .post(`/api/edge-servers/${registered.edgeId}/block`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        expect(blockResponse.status).toBe(200);
        expect(blockResponse.body.data?.edge?.lifecycleState).toBe('Blocked');

        await expect(forcedDisconnect).resolves.toEqual({
            edgeReason: 'blocked',
            disconnectReason: 'io server disconnect',
        });

        const blockedError = await connectEdgeExpectError({
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });
        expect(blockedError).toBe('blocked');

        const unblockResponse = await request(app)
            .post(`/api/edge-servers/${registered.edgeId}/unblock`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        expect(unblockResponse.status).toBe(200);
        expect(unblockResponse.body.data?.edge?.lifecycleState).toBe('Active');

        const oldCredentialAfterUnblock = await connectEdgeExpectError({
            edgeId: registered.edgeId,
            credentialSecret: registered.credentialSecret,
        });
        expect(oldCredentialAfterUnblock).toBe('invalid_credential');

        const newSecret = unblockResponse.body.data?.persistentCredential?.credentialSecret as string;
        const reconnected = await connectEdgeSocket({
            edgeId: registered.edgeId,
            credentialSecret: newSecret,
        });
        expect(reconnected.connected).toBe(true);
        await closeSocket(reconnected);
    });
});
