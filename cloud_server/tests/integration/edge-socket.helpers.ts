import { type AddressInfo } from 'node:net';
import { io as createSocketClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { app, server } from '../../src/app';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/services/auth.service';
import { EDGE_NAMESPACE } from '../../src/socket/events/edge';
import {
    ALARM_EDGE_EVENT_NAME,
    ALARM_INCIDENT_CHANGED_EVENT_NAME,
    type AlarmEventPayloadDto,
    type AlarmIncidentChangedEventDto,
} from '../../src/types';

export type EdgeRuntimeAuthPayload = Record<string, unknown>;

type RegisterEdgeResponse = {
    status: 'success';
    data?: {
        edge?: { _id?: string };
        persistentCredential?: {
            credentialSecret?: string;
            version?: number;
        };
    };
};

export async function createAdminSession(email: string): Promise<{ adminId: string; adminToken: string }> {
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN', subscriptionTier: 'PRO' }).exec();
    const { token } = await AuthService.login(email, 'password1234');

    return {
        adminId: user._id.toString(),
        adminToken: token,
    };
}

export async function createUserSession(email: string): Promise<{ userId: string; userToken: string }> {
    const { user, token } = await AuthService.register(email, 'password1234');

    return {
        userId: user._id.toString(),
        userToken: token,
    };
}

export async function ensureServerListening(): Promise<{ socketBaseUrl: string; startedSocketServer: boolean }> {
    const startedSocketServer = !server.listening;
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

    return {
        socketBaseUrl: `http://127.0.0.1:${(address as AddressInfo).port}`,
        startedSocketServer,
    };
}

export async function stopServerIfStarted(startedSocketServer: boolean): Promise<void> {
    if (!startedSocketServer || !server.listening) {
        return;
    }

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

export function trackSocket(activeSockets: Set<ClientSocket>, socket: ClientSocket): ClientSocket {
    activeSockets.add(socket);
    return socket;
}

export async function closeSocket(socket: ClientSocket): Promise<void> {
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

export async function cleanupClientSockets(activeSockets: Set<ClientSocket>): Promise<void> {
    const sockets = Array.from(activeSockets);
    activeSockets.clear();
    await Promise.all(sockets.map((socket) => closeSocket(socket)));
}

export async function registerEdge(
    adminToken: string,
    name: string,
): Promise<{ edgeId: string; credentialSecret: string; credentialVersion: number }> {
    const response = await request(app)
        .post('/api/edge-servers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name });

    if (response.status !== 201) {
        throw new Error(`edge_register_failed:${response.status}`);
    }

    const body = response.body as RegisterEdgeResponse;
    const edgeId = body.data?.edge?._id;
    const credentialSecret = body.data?.persistentCredential?.credentialSecret;
    const credentialVersion = body.data?.persistentCredential?.version;

    if (!edgeId || !credentialSecret || typeof credentialVersion !== 'number') {
        throw new Error('edge_register_missing_persistent_credential');
    }

    return { edgeId, credentialSecret, credentialVersion };
}

export async function rotateEdgeCredential(
    adminToken: string,
    edgeId: string,
): Promise<{ credentialSecret: string; credentialVersion: number }> {
    const response = await request(app)
        .post(`/api/edge-servers/${edgeId}/rotate-credential`)
        .set('Authorization', `Bearer ${adminToken}`);

    if (response.status !== 200) {
        throw new Error(`edge_rotate_failed:${response.status}`);
    }

    const body = response.body as RegisterEdgeResponse;
    const credentialSecret = body.data?.persistentCredential?.credentialSecret;
    const credentialVersion = body.data?.persistentCredential?.version;

    if (!credentialSecret || typeof credentialVersion !== 'number') {
        throw new Error('edge_rotate_missing_persistent_credential');
    }

    return { credentialSecret, credentialVersion };
}

export async function unblockEdge(
    adminToken: string,
    edgeId: string,
): Promise<{ credentialSecret: string; credentialVersion: number }> {
    const response = await request(app)
        .post(`/api/edge-servers/${edgeId}/unblock`)
        .set('Authorization', `Bearer ${adminToken}`);

    if (response.status !== 200) {
        throw new Error(`edge_unblock_failed:${response.status}`);
    }

    const body = response.body as RegisterEdgeResponse;
    const credentialSecret = body.data?.persistentCredential?.credentialSecret;
    const credentialVersion = body.data?.persistentCredential?.version;

    if (!credentialSecret || typeof credentialVersion !== 'number') {
        throw new Error('edge_unblock_missing_persistent_credential');
    }

    return { credentialSecret, credentialVersion };
}

export async function bindEdgeToUser(
    adminToken: string,
    edgeId: string,
    userId: string,
): Promise<void> {
    const response = await request(app)
        .post(`/api/edge-servers/${edgeId}/bind`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId });

    if (response.status !== 200) {
        throw new Error(`edge_bind_failed:${response.status}`);
    }
}

export async function blockEdge(adminToken: string, edgeId: string): Promise<void> {
    const response = await request(app)
        .post(`/api/edge-servers/${edgeId}/block`)
        .set('Authorization', `Bearer ${adminToken}`);

    if (response.status !== 200) {
        throw new Error(`edge_block_failed:${response.status}`);
    }
}

export async function connectDashboardSocket(
    socketBaseUrl: string,
    activeSockets: Set<ClientSocket>,
    userToken: string,
    edgeId: string,
): Promise<ClientSocket> {
    const socket = trackSocket(
        activeSockets,
        createSocketClient(socketBaseUrl, {
            auth: { token: `Bearer ${userToken}` },
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
            autoConnect: false,
            timeout: 3000,
        }),
    );

    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('dashboard_connect_timeout'));
        }, 3500);

        socket.once('connect', () => {
            clearTimeout(timer);
            resolve();
        });

        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            socket.close();
            reject(error);
        });

        socket.connect();
    });

    socket.emit('subscribe', { edgeId });
    const subscribed = await waitForEvent<{ edgeId: string }>(socket, 'subscribed');
    if (subscribed.edgeId !== edgeId) {
        throw new Error('dashboard_subscribed_unexpected_edge');
    }

    return socket;
}

export async function connectEdgeSocket(
    socketBaseUrl: string,
    activeSockets: Set<ClientSocket>,
    auth: EdgeRuntimeAuthPayload,
): Promise<ClientSocket> {
    const socket = trackSocket(
        activeSockets,
        createSocketClient(`${socketBaseUrl}${EDGE_NAMESPACE}`, {
            auth,
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
            autoConnect: false,
            timeout: 3000,
        }),
    );

    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('edge_connect_timeout'));
        }, 3500);

        socket.once('connect', () => {
            clearTimeout(timer);
            resolve();
        });

        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            socket.close();
            reject(error);
        });

        socket.connect();
    });

    return socket;
}

export async function connectEdgeExpectingError(
    socketBaseUrl: string,
    activeSockets: Set<ClientSocket>,
    auth: EdgeRuntimeAuthPayload,
): Promise<string> {
    const socket = trackSocket(
        activeSockets,
        createSocketClient(`${socketBaseUrl}${EDGE_NAMESPACE}`, {
            auth,
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
            autoConnect: false,
            timeout: 3000,
        }),
    );

    const message = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close();
            reject(new Error('edge_connect_error_timeout'));
        }, 3500);

        socket.once('connect', () => {
            clearTimeout(timer);
            socket.close();
            reject(new Error('expected_connect_error_but_connected'));
        });

        socket.once('connect_error', (error) => {
            clearTimeout(timer);
            resolve(error.message);
        });

        socket.connect();
    });

    await closeSocket(socket);
    activeSockets.delete(socket);
    return message;
}

export async function waitForEvent<TPayload>(
    socket: ClientSocket,
    event: string,
    timeoutMs = 3000,
): Promise<TPayload> {
    return await new Promise<TPayload>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${event}_timeout`)), timeoutMs);
        socket.once(event, (payload: TPayload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}

export async function expectNoEvent(
    socket: ClientSocket,
    event: string,
    timeoutMs = 250,
): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(event, onEvent);
            resolve();
        }, timeoutMs);

        const onEvent = () => {
            clearTimeout(timer);
            socket.off(event, onEvent);
            reject(new Error(`unexpected_${event}`));
        };

        socket.on(event, onEvent);
    });
}

// --- Command RPC test helpers (T009) ---

/**
 * Fires a POST /api/edge-servers/:edgeId/commands to the REAL listening server.
 *
 * Uses native fetch (Node 18+) instead of supertest request(app) so that the
 * HTTP request is sent eagerly — critical for tests that need to capture
 * execute_command before awaiting the HTTP response.
 *
 * Returns a Promise<Response> that resolves when the long-polling HTTP response
 * arrives (confirmed, timeout, etc.).
 */
export function postEdgeCommand(
    socketBaseUrl: string,
    userToken: string,
    edgeId: string,
    body: Record<string, unknown>,
): Promise<Response> {
    return fetch(`${socketBaseUrl}/api/edge-servers/${edgeId}/commands`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

export interface ExecuteCommandPayload {
    requestId: string;
    edgeId: string;
    deviceId: string;
    commandType: string;
    payload: { value: boolean | number };
}

/**
 * Registers a one-time listener on the Edge client socket for `execute_command`
 * and resolves with the received payload or rejects on timeout.
 * Must be set up BEFORE the HTTP POST that triggers the command.
 */
export function captureExecuteCommand(
    edgeSocket: ClientSocket,
    timeoutMs = 4000,
): Promise<ExecuteCommandPayload> {
    return new Promise<ExecuteCommandPayload>((resolve, reject) => {
        const timer = setTimeout(() => {
            edgeSocket.off('execute_command', onEvent);
            reject(new Error('execute_command_capture_timeout'));
        }, timeoutMs);

        const onEvent = (payload: ExecuteCommandPayload) => {
            clearTimeout(timer);
            resolve(payload);
        };

        edgeSocket.once('execute_command', onEvent);
    });
}

export interface CommandResultPayload {
    edgeId: string;
    requestId: string;
    status: 'confirmed' | 'timeout' | 'failed';
    failureReason?: 'edge_command_timeout' | 'edge_command_failed';
    completedAt: string;
}

/**
 * Emits a synthetic `command_result` from the Edge client socket back to Cloud.
 * The caller is responsible for providing a valid, trusted payload shape.
 */
export function emitCommandResult(
    edgeSocket: ClientSocket,
    payload: CommandResultPayload,
): void {
    edgeSocket.emit('command_result', payload);
}

export type AlarmEventPayload = AlarmEventPayloadDto;
export type AlarmIncidentChangedPayload = AlarmIncidentChangedEventDto;

export function emitAlarmEvent(
    edgeSocket: ClientSocket,
    payload: AlarmEventPayload,
): void {
    edgeSocket.emit(ALARM_EDGE_EVENT_NAME, payload);
}

export async function waitForAlarmIncidentChanged(
    dashboardSocket: ClientSocket,
    timeoutMs = 4000,
): Promise<AlarmIncidentChangedPayload> {
    return await waitForEvent<AlarmIncidentChangedPayload>(
        dashboardSocket,
        ALARM_INCIDENT_CHANGED_EVENT_NAME,
        timeoutMs,
    );
}

export async function waitForForcedDisconnect(
    socket: ClientSocket,
): Promise<{ edgeReason: string | null; disconnectReason: string }> {
    return await new Promise((resolve, reject) => {
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
