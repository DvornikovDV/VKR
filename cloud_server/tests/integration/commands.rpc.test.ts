/**
 * Integration tests: Cloud Command RPC with Audit
 *
 * T010 - Happy path: trusted USER POSTs command -> Edge receives execute_command
 *        -> Edge emits confirmed command_result -> HTTP 200, audit confirmed.
 *
 * T011 - Negative (cloud_rpc_timeout): Edge does not respond within 5 s ->
 *        HTTP 504, failureReason "cloud_rpc_timeout", late command_result
 *        cannot overwrite terminal audit state.
 *
 * Proof surface: real HTTP POST + real Socket.IO Edge client behavior.
 * No mock of execute_command delivery — test asserts the event arrived on the
 * Edge socket before accepting any result.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, server } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { CommandAudit } from '../../src/models/CommandAudit';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { resetActiveEdgeSocketsForTests } from '../../src/socket/events/edge';
import { resetPendingCommandRegistryForTests, getPendingCommandCount } from '../../src/services/command-pending-registry';
import {
    captureExecuteCommand,
    cleanupClientSockets,
    connectEdgeSocket,
    createAdminSession,
    createUserSession,
    emitCommandResult,
    ensureServerListening,
    postEdgeCommand,
    registerEdge,
    bindEdgeToUser,
    stopServerIfStarted,
} from './edge-socket.helpers';
import { type Socket as ClientSocket } from 'socket.io-client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let socketBaseUrl = '';
let startedSocketServer = false;
const activeSockets = new Set<ClientSocket>();

let adminId: string;
let adminToken: string;
let userId: string;
let userToken: string;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
    await connectDatabase();
    await User.deleteMany({}).exec();
    await EdgeServer.deleteMany({}).exec();
    await CommandAudit.deleteMany({}).exec();

    const result = await ensureServerListening();
    socketBaseUrl = result.socketBaseUrl;
    startedSocketServer = result.startedSocketServer;

    ({ adminId, adminToken } = await createAdminSession('cmd_rpc_admin@test.com'));
    ({ userId, userToken } = await createUserSession('cmd_rpc_user@test.com'));

    void adminId; // used by bind helper indirectly
});

afterEach(async () => {
    await cleanupClientSockets(activeSockets);
    resetActiveEdgeSocketsForTests();
    resetPendingCommandRegistryForTests();
    await CommandAudit.deleteMany({}).exec();
    await EdgeServer.deleteMany({}).exec();
});

afterAll(async () => {
    await cleanupClientSockets(activeSockets);
    resetActiveEdgeSocketsForTests();
    resetPendingCommandRegistryForTests();
    await User.deleteMany({}).exec();
    await EdgeServer.deleteMany({}).exec();
    await CommandAudit.deleteMany({}).exec();
    await stopServerIfStarted(startedSocketServer);
    await disconnectDatabase();
});

// ---------------------------------------------------------------------------
// Helpers local to this suite
// ---------------------------------------------------------------------------

async function setupEdgeWithUser(): Promise<{
    edgeId: string;
    credentialSecret: string;
}> {
    const { edgeId, credentialSecret } = await registerEdge(adminToken, 'RPC Test Edge');
    await bindEdgeToUser(adminToken, edgeId, userId);
    return { edgeId, credentialSecret };
}

async function connectTrustedEdge(edgeId: string, credentialSecret: string): Promise<ClientSocket> {
    return connectEdgeSocket(socketBaseUrl, activeSockets, {
        edgeId,
        credentialSecret,
    });
}

// ---------------------------------------------------------------------------
// T010 — Happy path
// ---------------------------------------------------------------------------

describe('POST /api/edge-servers/:edgeId/commands — Cloud RPC audit', () => {
    it(
        'T010: trusted USER command returns 200, execute_command delivered, audit confirmed',
        async () => {
            const { edgeId, credentialSecret } = await setupEdgeWithUser();
            const edgeSocket = await connectTrustedEdge(edgeId, credentialSecret);

            // Edge listener: respond immediately on execute_command to prove production path
            // accepts a result that arrives before capturePromise is awaited.
            edgeSocket.once('execute_command', (payload: { requestId: string }) => {
                emitCommandResult(edgeSocket, {
                    edgeId,
                    requestId: payload.requestId,
                    status: 'confirmed',
                    completedAt: new Date().toISOString(),
                });
            });

            // Start HTTP POST eagerly (fetch fires immediately, unlike supertest request(app))
            const postPromise = postEdgeCommand(socketBaseUrl, userToken, edgeId, {
                deviceId: 'pump-01',
                commandType: 'set_bool',
                payload: { value: true },
            });

            // Also capture execute_command to extract requestId for audit assertions
            const capturePromise = captureExecuteCommand(edgeSocket, 4000);

            // Await HTTP response
            const response = await postPromise;
            const body = (await response.json()) as Record<string, unknown>;
            expect(response.status).toBe(200);
            expect(body['status']).toBe('success');
            const data = body['data'] as Record<string, unknown>;
            expect(typeof data['requestId']).toBe('string');
            expect(typeof data['completedAt']).toBe('string');
            expect(data['commandStatus']).toBe('confirmed');

            // Verify CommandAudit terminal state
            const received = await capturePromise;
            const audit = await CommandAudit.findOne({ requestId: received.requestId }).exec();
            expect(audit).not.toBeNull();
            expect(audit!.status).toBe('confirmed');
            expect(audit!.edgeId.toString()).toBe(edgeId);
            expect(audit!.deviceId).toBe('pump-01');
            expect(audit!.completedAt).not.toBeNull();
            expect(audit!.failureReason).toBeNull();

            // Pending registry must be empty after successful completion
            expect(getPendingCommandCount()).toBe(0);
        },
        12000,
    );

    // -----------------------------------------------------------------------
    // T011 — Cloud RPC timeout negative path
    // -----------------------------------------------------------------------

    it(
        'T011: cloud_rpc_timeout returns 504, late command_result cannot overwrite terminal audit',
        async () => {
            vi.useRealTimers();

            const { edgeId, credentialSecret } = await setupEdgeWithUser();
            const edgeSocket = await connectTrustedEdge(edgeId, credentialSecret);

            // Capture execute_command so we know the requestId for the late emit
            const capturePromise = captureExecuteCommand(edgeSocket, 6000);

            const postPromise = postEdgeCommand(socketBaseUrl, userToken, edgeId, {
                deviceId: 'valve-02',
                commandType: 'set_bool',
                payload: { value: false },
            });

            // Wait for execute_command
            const received = await capturePromise;
            expect(typeof received.requestId).toBe('string');

            // Intentionally do NOT emit command_result — let Cloud RPC timeout fire

            // Await HTTP response — expect 504
            const response = await postPromise;
            const body = (await response.json()) as Record<string, unknown>;
            expect(response.status).toBe(504);
            expect(body['status']).toBe('error');
            expect(body['failureReason']).toBe('cloud_rpc_timeout');
            expect(body['commandStatus']).toBe('timeout');

            // Pending registry MUST be empty before afterEach (not relying on reset for proof)
            expect(getPendingCommandCount()).toBe(0);

            // Verify CommandAudit was written as terminal timeout
            const audit = await CommandAudit.findOne({ requestId: received.requestId }).exec();
            expect(audit).not.toBeNull();
            expect(audit!.status).toBe('timeout');
            expect(audit!.failureReason).toBe('cloud_rpc_timeout');

            // Now emit a LATE command_result — it must NOT overwrite the terminal audit
            emitCommandResult(edgeSocket, {
                edgeId,
                requestId: received.requestId,
                status: 'confirmed',
                completedAt: new Date().toISOString(),
            });

            // Small pause to let any erroneous handler fire
            await new Promise<void>((resolve) => setTimeout(resolve, 200));

            // Registry must still be empty after late emit (no phantom registration)
            expect(getPendingCommandCount()).toBe(0);

            // Re-fetch audit — must remain timeout
            const auditAfterLateResult = await CommandAudit.findOne({
                requestId: received.requestId,
            }).exec();
            expect(auditAfterLateResult!.status).toBe('timeout');
            expect(auditAfterLateResult!.failureReason).toBe('cloud_rpc_timeout');
        },
        15000,
    );
});
