/**
 * smoke-commands-rpc.ts
 *
 * T024 runtime smoke: validates POST /api/edge-servers/:edgeId/commands
 * against a live Cloud process using a synthetic trusted /edge socket.
 *
 * Scenarios verified:
 *   A. Trusted USER POST → execute_command delivered → synthetic confirmed → HTTP 200, audit confirmed
 *   B. Trusted USER POST → no response → cloud_rpc_timeout → HTTP 504, audit timeout
 *
 * Run from cloud_server/:
 *   ts-node src/scripts/smoke-commands-rpc.ts
 */

import { type AddressInfo } from 'node:net';
import { io as createSocketClient } from 'socket.io-client';
import { server } from '../app';
import { connectDatabase, disconnectDatabase } from '../database/mongoose';
import { User } from '../models/User';
import { EdgeServer } from '../models/EdgeServer';
import { CommandAudit } from '../models/CommandAudit';
import { AuthService } from '../services/auth.service';

import { EDGE_NAMESPACE } from '../socket/events/edge';

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
    console.log(`[smoke] ${msg}`);
}

function fail(msg: string): never {
    console.error(`[smoke][FAIL] ${msg}`);
    process.exit(1);
}

async function startServer(): Promise<{ baseUrl: string }> {
    await connectDatabase();
    await new Promise<void>((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => resolve());
        server.once('error', reject);
    });
    const addr = server.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function stopServer() {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
}

async function setup(baseUrl: string) {
    // Clean slate
    await User.deleteMany({}).exec();
    await EdgeServer.deleteMany({}).exec();
    await CommandAudit.deleteMany({}).exec();

    // Admin session
    const adminEmail = 'smoke_admin@test.local';
    const adminPass = 'password1234';
    const { user: adminUser } = await AuthService.register(adminEmail, adminPass);
    await User.findByIdAndUpdate(adminUser._id, { role: 'ADMIN', subscriptionTier: 'PRO' }).exec();
    const { token: adminToken } = await AuthService.login(adminEmail, adminPass);

    // User session
    const userEmail = 'smoke_user@test.local';
    const userPass = 'password1234';
    const { user: userObj, token: userToken } = await AuthService.register(userEmail, userPass);

    // Register Edge via service directly (avoids HTTP round-trip for setup)
    const edgeResult = await fetch(`${baseUrl}/api/edge-servers`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Smoke Test Edge' }),
    });
    if (edgeResult.status !== 201) fail(`Edge register failed: ${edgeResult.status}`);
    const edgeBody = (await edgeResult.json()) as Record<string, unknown>;
    const edgeData = edgeBody['data'] as Record<string, unknown>;
    const edgeId = (edgeData['edge'] as Record<string, unknown>)['_id'] as string;
    const credentialSecret = (edgeData['persistentCredential'] as Record<string, unknown>)['credentialSecret'] as string;

    // Bind user to edge
    const bindResult = await fetch(`${baseUrl}/api/edge-servers/${edgeId}/bind`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: userObj._id.toString() }),
    });
    if (bindResult.status !== 200) fail(`Edge bind failed: ${bindResult.status}`);

    return { adminToken, userToken, edgeId, credentialSecret, userId: userObj._id.toString() };
}

function connectEdge(baseUrl: string, edgeId: string, credentialSecret: string) {
    const socket = createSocketClient(`${baseUrl}${EDGE_NAMESPACE}`, {
        auth: { edgeId, credentialSecret },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        autoConnect: false,
        timeout: 3000,
    });

    return new Promise<typeof socket>((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('edge_connect_timeout'));
        }, 4000);
        socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
        socket.once('connect_error', (err) => { clearTimeout(timer); socket.close(); reject(err); });
        socket.connect();
    });
}

// ── Scenario A: Happy path ───────────────────────────────────────────────────

async function scenarioA(baseUrl: string, userToken: string, edgeId: string, credentialSecret: string) {
    log('Scenario A: trusted USER POST → confirmed → HTTP 200');

    const edgeSocket = await connectEdge(baseUrl, edgeId, credentialSecret);

    // Capture execute_command and respond immediately
    const capturePromise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('execute_command not received')), 5000);
        edgeSocket.once('execute_command', (payload: { requestId: string }) => {
            clearTimeout(timer);
            edgeSocket.emit('command_result', {
                edgeId,
                requestId: payload.requestId,
                status: 'confirmed',
                completedAt: new Date().toISOString(),
            });
            resolve(payload.requestId);
        });
    });

    const postPromise = fetch(`${baseUrl}/api/edge-servers/${edgeId}/commands`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceId: 'pump-01', commandType: 'set_bool', payload: { value: true } }),
    });

    const [requestId, response] = await Promise.all([capturePromise, postPromise]);

    if (response.status !== 200) fail(`Scenario A: expected 200, got ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    if (body['status'] !== 'success') fail(`Scenario A: body.status=${String(body['status'])}, expected success`);
    const data = body['data'] as Record<string, unknown>;
    if (data['commandStatus'] !== 'confirmed') fail(`Scenario A: commandStatus=${String(data['commandStatus'])}`);

    // Verify audit
    const audit = await CommandAudit.findOne({ requestId }).exec();
    if (!audit) fail('Scenario A: CommandAudit not found');
    if (audit!.status !== 'confirmed') fail(`Scenario A: audit.status=${audit!.status}`);
    if (audit!.failureReason !== null && audit!.failureReason !== undefined) fail(`Scenario A: unexpected failureReason=${String(audit!.failureReason)}`);

    edgeSocket.disconnect();
    log('Scenario A: PASS ✓');
}

// ── Scenario B: Timeout path ─────────────────────────────────────────────────

async function scenarioB(baseUrl: string, userToken: string, edgeId: string, credentialSecret: string) {
    log('Scenario B: no Edge response → cloud_rpc_timeout → HTTP 504');

    const edgeSocket = await connectEdge(baseUrl, edgeId, credentialSecret);

    const capturePromise = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('execute_command not received in B')), 6000);
        edgeSocket.once('execute_command', (payload: { requestId: string }) => {
            clearTimeout(timer);
            resolve(payload.requestId);
            // Intentionally do NOT emit command_result
        });
    });

    const postPromise = fetch(`${baseUrl}/api/edge-servers/${edgeId}/commands`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceId: 'valve-02', commandType: 'set_bool', payload: { value: false } }),
    });

    const [requestId, response] = await Promise.all([capturePromise, postPromise]);

    if (response.status !== 504) fail(`Scenario B: expected 504, got ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    if (body['failureReason'] !== 'cloud_rpc_timeout') fail(`Scenario B: failureReason=${String(body['failureReason'])}`);
    if (body['commandStatus'] !== 'timeout') fail(`Scenario B: commandStatus=${String(body['commandStatus'])}`);

    // Emit late result — must NOT overwrite terminal audit
    edgeSocket.emit('command_result', {
        edgeId,
        requestId,
        status: 'confirmed',
        completedAt: new Date().toISOString(),
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    const audit = await CommandAudit.findOne({ requestId }).exec();
    if (!audit) fail('Scenario B: CommandAudit not found');
    if (audit!.status !== 'timeout') fail(`Scenario B: audit.status=${audit!.status} after late result`);
    if (audit!.failureReason !== 'cloud_rpc_timeout') fail(`Scenario B: audit.failureReason=${String(audit!.failureReason)}`);

    edgeSocket.disconnect();
    log('Scenario B: PASS ✓');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    log('Starting smoke: Cloud Command RPC T024');

    const { baseUrl } = await startServer();
    log(`Server listening at ${baseUrl}`);

    try {
        const { userToken, edgeId, credentialSecret } = await setup(baseUrl);

        await scenarioA(baseUrl, userToken, edgeId, credentialSecret);

        // Reset between scenarios
        await CommandAudit.deleteMany({}).exec();

        await scenarioB(baseUrl, userToken, edgeId, credentialSecret);

        log('');
        log('All smoke scenarios PASSED ✓');
        log('T024: COMPLETE');
    } finally {
        await User.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        await CommandAudit.deleteMany({}).exec();
        await stopServer();
    }
}

main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error(`[smoke][FATAL] ${msg}`);
    process.exit(1);
});
