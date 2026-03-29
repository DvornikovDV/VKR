import { type AddressInfo } from 'node:net';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, server } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeOnboardingAudit } from '../../src/models/EdgeOnboardingAudit';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/services/auth.service';
import { verifyCredentialSecret } from '../../src/services/edge-onboarding.service';
import { EDGE_NAMESPACE } from '../../src/socket/events/edge';

let adminToken = '';
let edgeSocketUrl = '';
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

async function createAdminToken(email: string): Promise<string> {
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN' }).exec();
    const login = await AuthService.login(email, 'password1234');
    return login.token;
}

async function ensureServerListening(): Promise<string> {
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

async function connectEdgeSocket(auth: {
    edgeId: string;
    credentialMode: 'onboarding' | 'persistent';
    credentialSecret: string;
}): Promise<ClientSocket> {
    return new Promise<ClientSocket>((resolve, reject) => {
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

async function connectEdgeExpectError(auth: {
    edgeId: string;
    credentialMode: 'onboarding' | 'persistent';
    credentialSecret: string;
}): Promise<string> {
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

async function registerEdge(name: string): Promise<{ edgeId: string; onboardingSecret: string }> {
    const registration = await request(app)
        .post('/api/edge-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name });

    expect(registration.status).toBe(201);
    expect(registration.body.status).toBe('success');

    return {
        edgeId: registration.body.data?.edge?._id as string,
        onboardingSecret: registration.body.data?.onboardingPackage?.onboardingSecret as string,
    };
}

describe('Edge onboarding integration contract', () => {
    beforeAll(async () => {
        await connectDatabase();
        await User.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        await EdgeOnboardingAudit.deleteMany({}).exec();
        edgeSocketUrl = await ensureServerListening();

        adminToken = await createAdminToken('admin_edge_onboarding@test.com');
    });

    beforeEach(async () => {
        await EdgeServer.deleteMany({}).exec();
        await EdgeOnboardingAudit.deleteMany({}).exec();
    });

    afterEach(async () => {
        await cleanupClientSockets();
    });

    afterAll(async () => {
        await cleanupClientSockets();
        await User.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        await EdgeOnboardingAudit.deleteMany({}).exec();
        if (server.listening) {
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

    describe('REST onboarding flows', () => {
        it('registers an edge and discloses a one-time onboarding package', async () => {
            const response = await request(app)
                .post('/api/edge-servers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Edge One' });

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');
            expect(response.body.data?.edge?.name).toBe('Edge One');
            expect(response.body.data?.edge?.lifecycleState).toBe('Pending First Connection');
            expect(response.body.data?.edge?.isTelemetryReady).toBe(false);
            expect(response.body.data?.onboardingPackage?.edgeId).toBe(response.body.data?.edge?._id);

            const onboardingSecret = response.body.data?.onboardingPackage?.onboardingSecret;
            expect(typeof onboardingSecret).toBe('string');
            expect(onboardingSecret.length).toBeGreaterThan(20);

            const issuedAt = new Date(response.body.data?.onboardingPackage?.issuedAt).getTime();
            const expiresAt = new Date(response.body.data?.onboardingPackage?.expiresAt).getTime();
            expect(expiresAt).toBeGreaterThan(issuedAt);
        });

        it('hides full secret on later fleet reads while keeping package metadata', async () => {
            const registration = await request(app)
                .post('/api/edge-servers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Edge Masking' });

            expect(registration.status).toBe(201);
            const edgeId = registration.body.data?.edge?._id as string;
            const disclosedSecret = registration.body.data?.onboardingPackage?.onboardingSecret as string;
            expect(typeof disclosedSecret).toBe('string');

            const fleet = await request(app)
                .get('/api/admin/edge-servers')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(fleet.status).toBe(200);
            const edgeRecord = (fleet.body.data as Array<Record<string, unknown>>).find(
                (edge) => edge['_id'] === edgeId,
            );

            expect(edgeRecord).toBeTruthy();
            const currentOnboardingPackage = edgeRecord?.['currentOnboardingPackage'] as
                | Record<string, unknown>
                | null
                | undefined;
            expect(currentOnboardingPackage).toBeTruthy();
            expect(currentOnboardingPackage?.['status']).toBe('ready');
            expect(currentOnboardingPackage?.['credentialId']).toBeTypeOf('string');
            expect(currentOnboardingPackage?.['issuedAt']).toBeTypeOf('string');
            expect(currentOnboardingPackage?.['expiresAt']).toBeTypeOf('string');
            expect('onboardingSecret' in (currentOnboardingPackage ?? {})).toBe(false);
            expect('secretHash' in (currentOnboardingPackage ?? {})).toBe(false);
            expect(JSON.stringify(edgeRecord)).not.toContain(disclosedSecret);
        });

        it('resets onboarding package and invalidates previously issued secret', async () => {
            const registration = await request(app)
                .post('/api/edge-servers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Edge Reset' });

            expect(registration.status).toBe(201);
            const edgeId = registration.body.data?.edge?._id as string;
            const firstSecret = registration.body.data?.onboardingPackage?.onboardingSecret as string;

            const beforeReset = await EdgeServer.findById(edgeId).exec();
            const previousCredentialId = beforeReset?.currentOnboardingPackage?.credentialId ?? null;
            expect(previousCredentialId).toBeTruthy();

            const reset = await request(app)
                .post(`/api/edge-servers/${edgeId}/onboarding/reset`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(reset.status).toBe(200);
            expect(reset.body.status).toBe('success');
            expect(reset.body.data?.edge?._id).toBe(edgeId);
            expect(reset.body.data?.edge?.lifecycleState).toBe('Pending First Connection');

            const secondSecret = reset.body.data?.onboardingPackage?.onboardingSecret as string;
            expect(typeof secondSecret).toBe('string');
            expect(secondSecret).not.toBe(firstSecret);

            const afterReset = await EdgeServer.findById(edgeId).exec();
            const currentPackage = afterReset?.currentOnboardingPackage;
            expect(currentPackage).toBeTruthy();
            expect(currentPackage?.status).toBe('ready');
            expect(currentPackage?.credentialId).not.toBe(previousCredentialId);

            await expect(
                verifyCredentialSecret(firstSecret, currentPackage?.secretHash ?? ''),
            ).resolves.toBe(false);
            await expect(
                verifyCredentialSecret(secondSecret, currentPackage?.secretHash ?? ''),
            ).resolves.toBe(true);
            await expect(
                verifyCredentialSecret(firstSecret, afterReset?.apiKeyHash ?? ''),
            ).resolves.toBe(false);
            await expect(
                verifyCredentialSecret(secondSecret, afterReset?.apiKeyHash ?? ''),
            ).resolves.toBe(true);
        });
    });

    describe('Socket.IO onboarding flows', () => {
        it('accepts first activation with valid onboarding credential', async () => {
            const { edgeId, onboardingSecret } = await registerEdge('Edge Socket Activate');

            const { socket, activationPayload } = await connectOnboardingSocket(edgeId, onboardingSecret);
            expect(activationPayload.edgeId).toBe(edgeId);
            expect(activationPayload.lifecycleState).toBe('Active');
            expect(activationPayload.persistentCredential.version).toBe(1);
            expect(typeof activationPayload.persistentCredential.secret).toBe('string');
            expect(activationPayload.persistentCredential.secret.length).toBeGreaterThan(20);

            const edge = await EdgeServer.findById(edgeId).exec();
            expect(edge?.lifecycleState).toBe('Active');
            expect(edge?.currentOnboardingPackage?.status).toBe('used');
            expect(edge?.currentOnboardingPackage?.usedAt).toBeInstanceOf(Date);
            expect(edge?.persistentCredential?.version).toBe(1);
            await expect(
                verifyCredentialSecret(
                    activationPayload.persistentCredential.secret,
                    edge?.persistentCredential?.secretHash ?? '',
                ),
            ).resolves.toBe(true);

            const auditEvents = await EdgeOnboardingAudit.find({ edgeId }).lean().exec();
            const eventTypes = auditEvents.map((event) => event.type);
            expect(eventTypes).toContain('activation_succeeded');
            expect(eventTypes).toContain('persistent_issued');

            const persistentIssued = auditEvents.find((event) => event.type === 'persistent_issued');
            expect(persistentIssued?.details).toMatchObject({
                version: 1,
            });
            expect(persistentIssued?.details).not.toHaveProperty('secret');

            socket.disconnect();
        });

        it('rejects reused, invalid, or expired onboarding credentials', async () => {
            const firstEdge = await registerEdge('Edge Reused Secret');
            const { socket: firstSocket } = await connectOnboardingSocket(
                firstEdge.edgeId,
                firstEdge.onboardingSecret,
            );
            firstSocket.disconnect();

            await EdgeServer.findByIdAndUpdate(firstEdge.edgeId, {
                $set: { lifecycleState: 'Re-onboarding Required' },
            }).exec();

            const reusedError = await connectEdgeExpectError({
                edgeId: firstEdge.edgeId,
                credentialMode: 'onboarding',
                credentialSecret: firstEdge.onboardingSecret,
            });
            expect(reusedError).toBe('onboarding_package_reused');

            const secondEdge = await registerEdge('Edge Invalid Secret');
            const invalidError = await connectEdgeExpectError({
                edgeId: secondEdge.edgeId,
                credentialMode: 'onboarding',
                credentialSecret: 'invalid-secret',
            });
            expect(invalidError).toBe('invalid_credential');

            const secondEdgeAuditEvents = await EdgeOnboardingAudit.find({ edgeId: secondEdge.edgeId })
                .lean()
                .exec();
            const hasActivationRejected = secondEdgeAuditEvents.some(
                (event) => event.type === 'activation_rejected',
            );
            expect(hasActivationRejected).toBe(true);

            const thirdEdge = await registerEdge('Edge Expired Secret');
            await EdgeServer.findByIdAndUpdate(thirdEdge.edgeId, {
                $set: {
                    'currentOnboardingPackage.expiresAt': new Date('2000-01-01T00:00:00.000Z'),
                    'currentOnboardingPackage.status': 'ready',
                },
            }).exec();

            const expiredError = await connectEdgeExpectError({
                edgeId: thirdEdge.edgeId,
                credentialMode: 'onboarding',
                credentialSecret: thirdEdge.onboardingSecret,
            });
            expect(expiredError).toBe('onboarding_package_expired');

            const expiredEdge = await EdgeServer.findById(thirdEdge.edgeId).exec();
            expect(expiredEdge?.currentOnboardingPackage?.status).toBe('expired');
        });

        it('accepts trusted reconnect only with persistent credential', async () => {
            const { edgeId, onboardingSecret } = await registerEdge('Edge Persistent Reconnect');
            const { socket: onboardingSocket, activationPayload } = await connectOnboardingSocket(
                edgeId,
                onboardingSecret,
            );
            onboardingSocket.disconnect();

            const persistentSocket = await connectEdgeSocket({
                edgeId,
                credentialMode: 'persistent',
                credentialSecret: activationPayload.persistentCredential.secret,
            });

            let activationEventCount = 0;
            persistentSocket.on('edge_activation', () => {
                activationEventCount += 1;
            });
            await new Promise((resolve) => setTimeout(resolve, 200));
            expect(activationEventCount).toBe(0);

            const edgeAfterReconnect = await EdgeServer.findById(edgeId).exec();
            expect(edgeAfterReconnect?.persistentCredential?.lastAcceptedAt).toBeInstanceOf(Date);

            const wrongPersistentError = await connectEdgeExpectError({
                edgeId,
                credentialMode: 'persistent',
                credentialSecret: onboardingSecret,
            });
            expect(wrongPersistentError).toBe('invalid_credential');

            persistentSocket.disconnect();
        });
    });

    describe('US3 lifecycle recovery and blocking flows', () => {
        it('T023-1 revokes trust, disconnects active persistent session, and rejects old persistent credential', async () => {
            const { edgeId, onboardingSecret } = await registerEdge('Edge Trust Revoke');
            const { socket: onboardingSocket, activationPayload } = await connectOnboardingSocket(
                edgeId,
                onboardingSecret,
            );
            onboardingSocket.disconnect();

            const persistentSocket = await connectEdgeSocket({
                edgeId,
                credentialMode: 'persistent',
                credentialSecret: activationPayload.persistentCredential.secret,
            });

            const disconnectWait = waitForForcedDisconnect(persistentSocket);
            const revokeResponse = await request(app)
                .post(`/api/edge-servers/${edgeId}/trust/revoke`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(revokeResponse.status).toBe(200);
            expect(revokeResponse.body.status).toBe('success');
            expect(revokeResponse.body.data?.lifecycleState).toBe('Re-onboarding Required');
            expect(revokeResponse.body.data?.isTelemetryReady).toBe(false);

            const disconnected = await disconnectWait;
            expect(disconnected.edgeReason).toBe('trust_revoked');
            expect(disconnected.disconnectReason).toBe('io server disconnect');

            const edgeAfterRevoke = await EdgeServer.findById(edgeId).exec();
            expect(edgeAfterRevoke?.lifecycleState).toBe('Re-onboarding Required');
            expect(edgeAfterRevoke?.persistentCredential?.revokedAt).toBeInstanceOf(Date);
            expect(edgeAfterRevoke?.persistentCredential?.revocationReason).toBe('recovery');

            const reconnectError = await connectEdgeExpectError({
                edgeId,
                credentialMode: 'persistent',
                credentialSecret: activationPayload.persistentCredential.secret,
            });
            expect(reconnectError).toBe('persistent_credential_revoked');
        });

        it('T023-2 blocks edge, disconnects active session, and rejects onboarding plus persistent credentials', async () => {
            const { edgeId, onboardingSecret } = await registerEdge('Edge Block Flow');
            const { socket: onboardingSocket, activationPayload } = await connectOnboardingSocket(
                edgeId,
                onboardingSecret,
            );
            onboardingSocket.disconnect();

            const resetResponse = await request(app)
                .post(`/api/edge-servers/${edgeId}/onboarding/reset`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(resetResponse.status).toBe(200);
            const recoveryOnboardingSecret = resetResponse.body.data?.onboardingPackage
                ?.onboardingSecret as string;

            const persistentSocket = await connectEdgeSocket({
                edgeId,
                credentialMode: 'persistent',
                credentialSecret: activationPayload.persistentCredential.secret,
            });

            const disconnectWait = waitForForcedDisconnect(persistentSocket);
            const blockResponse = await request(app)
                .post(`/api/edge-servers/${edgeId}/block`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(blockResponse.status).toBe(200);
            expect(blockResponse.body.status).toBe('success');
            expect(blockResponse.body.data?.lifecycleState).toBe('Blocked');
            expect(blockResponse.body.data?.isTelemetryReady).toBe(false);

            const disconnected = await disconnectWait;
            expect(disconnected.edgeReason).toBe('blocked');
            expect(disconnected.disconnectReason).toBe('io server disconnect');

            const edgeAfterBlock = await EdgeServer.findById(edgeId).exec();
            expect(edgeAfterBlock?.lifecycleState).toBe('Blocked');
            expect(edgeAfterBlock?.persistentCredential?.revokedAt).toBeInstanceOf(Date);
            expect(edgeAfterBlock?.persistentCredential?.revocationReason).toBe('block');
            expect(edgeAfterBlock?.currentOnboardingPackage?.status).toBe('blocked');

            const blockedPersistentError = await connectEdgeExpectError({
                edgeId,
                credentialMode: 'persistent',
                credentialSecret: activationPayload.persistentCredential.secret,
            });
            expect(blockedPersistentError).toBe('blocked');

            const blockedOnboardingError = await connectEdgeExpectError({
                edgeId,
                credentialMode: 'onboarding',
                credentialSecret: recoveryOnboardingSecret,
            });
            expect(blockedOnboardingError).toBe('blocked');
        });

        it('T023-3 re-enables blocked edge without secret disclosure and requires explicit reset before successful onboarding', async () => {
            const { edgeId, onboardingSecret } = await registerEdge('Edge Re-enable Flow');

            const blockResponse = await request(app)
                .post(`/api/edge-servers/${edgeId}/block`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(blockResponse.status).toBe(200);
            expect(blockResponse.body.data?.lifecycleState).toBe('Blocked');

            const reenableResponse = await request(app)
                .post(`/api/edge-servers/${edgeId}/re-enable-onboarding`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(reenableResponse.status).toBe(200);
            expect(reenableResponse.body.status).toBe('success');
            expect(reenableResponse.body.data?.lifecycleState).toBe('Re-onboarding Required');
            expect(reenableResponse.body.data?.isTelemetryReady).toBe(false);
            expect(reenableResponse.body.data?.onboardingPackage).toBeUndefined();

            const oldSecretError = await connectEdgeExpectError({
                edgeId,
                credentialMode: 'onboarding',
                credentialSecret: onboardingSecret,
            });
            expect(oldSecretError).toBe('blocked');

            const resetResponse = await request(app)
                .post(`/api/edge-servers/${edgeId}/onboarding/reset`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(resetResponse.status).toBe(200);
            const renewedOnboardingSecret = resetResponse.body.data?.onboardingPackage
                ?.onboardingSecret as string;

            const { socket: reactivatedSocket, activationPayload } = await connectOnboardingSocket(
                edgeId,
                renewedOnboardingSecret,
            );

            expect(activationPayload.lifecycleState).toBe('Active');
            reactivatedSocket.disconnect();
        });

        it('T033-1 keeps lifecycle and legacy compatibility fields synchronized for update queries', async () => {
            const { edgeId, onboardingSecret } = await registerEdge('Edge Legacy Sync Guard');
            const { socket: onboardingSocket, activationPayload } = await connectOnboardingSocket(
                edgeId,
                onboardingSecret,
            );
            onboardingSocket.disconnect();

            const canonicalLastSeenAt = new Date('2026-03-29T00:00:00.000Z');
            const staleLegacyLastSeen = new Date('2020-01-01T00:00:00.000Z');

            await EdgeServer.updateOne(
                { _id: edgeId },
                {
                    $set: {
                        lifecycleState: 'Blocked',
                        isActive: true,
                        'availability.lastSeenAt': canonicalLastSeenAt,
                        lastSeen: staleLegacyLastSeen,
                        apiKeyHash: 'plain-mismatch-hash',
                    },
                },
            ).exec();

            const edgeAfterUpdate = await EdgeServer.findById(edgeId).exec();
            expect(edgeAfterUpdate?.lifecycleState).toBe('Blocked');
            expect(edgeAfterUpdate?.isActive).toBe(false);
            expect(edgeAfterUpdate?.lastSeen?.toISOString()).toBe(canonicalLastSeenAt.toISOString());
            expect(edgeAfterUpdate?.availability.lastSeenAt?.toISOString()).toBe(
                canonicalLastSeenAt.toISOString(),
            );
            await expect(
                verifyCredentialSecret(
                    activationPayload.persistentCredential.secret,
                    edgeAfterUpdate?.apiKeyHash ?? '',
                ),
            ).resolves.toBe(true);

            const blockedReconnectError = await connectEdgeExpectError({
                edgeId,
                credentialMode: 'persistent',
                credentialSecret: activationPayload.persistentCredential.secret,
            });
            expect(blockedReconnectError).toBe('blocked');
        });
    });
});
