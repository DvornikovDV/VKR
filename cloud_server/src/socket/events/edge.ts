import { type Server as IOServer, type Socket } from 'socket.io';
import { updateLastSeen } from '../../services/edge-servers.service';
import {
    EdgeOnboardingService,
    type EdgeActivationPayload,
} from '../../services/edge-onboarding.service';
import { registerTelemetryHandler } from './telemetry';

export const EDGE_NAMESPACE = '/edge';

export type EdgeCredentialMode = 'onboarding' | 'persistent';
export type EdgeForcedDisconnectReason = 'edge_forced_disconnect' | 'trust_revoked' | 'blocked';
const EDGE_CREDENTIAL_MODES: readonly EdgeCredentialMode[] = ['onboarding', 'persistent'];

type EdgeAuthPayload = {
    edgeId: string;
    credentialMode: EdgeCredentialMode;
    credentialSecret: string;
};

type AuthenticatedEdgeContext = {
    edgeId: string;
    credentialMode: EdgeCredentialMode;
    lifecycleState: 'Active';
    edgeActivation: EdgeActivationPayload | null;
};

const activeEdgeSockets = new Map<string, Set<Socket>>();

function isEdgeCredentialMode(value: unknown): value is EdgeCredentialMode {
    return (
        typeof value === 'string' &&
        (EDGE_CREDENTIAL_MODES as readonly string[]).includes(value)
    );
}

function normalizeEdgeAuthPayload(socket: Socket): EdgeAuthPayload | null {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;

    const edgeId = typeof auth?.['edgeId'] === 'string' ? auth['edgeId'].trim() : '';
    const credentialMode = auth?.['credentialMode'];
    const credentialSecret =
        typeof auth?.['credentialSecret'] === 'string' ? auth['credentialSecret'].trim() : '';

    if (!edgeId || !isEdgeCredentialMode(credentialMode) || !credentialSecret) {
        return null;
    }

    return {
        edgeId,
        credentialMode,
        credentialSecret,
    };
}

function trackActiveEdgeSocket(edgeId: string, socket: Socket): void {
    const socketsForEdge = activeEdgeSockets.get(edgeId) ?? new Set<Socket>();
    socketsForEdge.add(socket);
    activeEdgeSockets.set(edgeId, socketsForEdge);
}

function untrackActiveEdgeSocket(edgeId: string, socket: Socket): void {
    const socketsForEdge = activeEdgeSockets.get(edgeId);
    if (!socketsForEdge) return;

    socketsForEdge.delete(socket);
    if (socketsForEdge.size === 0) {
        activeEdgeSockets.delete(edgeId);
    }
}

export function getActiveEdgeSocketCount(edgeId?: string): number {
    if (edgeId) {
        return activeEdgeSockets.get(edgeId)?.size ?? 0;
    }

    let total = 0;
    for (const socketsForEdge of activeEdgeSockets.values()) {
        total += socketsForEdge.size;
    }
    return total;
}

export function disconnectEdgeSockets(
    edgeId: string,
    reason: EdgeForcedDisconnectReason = 'edge_forced_disconnect',
): number {
    const socketsForEdge = activeEdgeSockets.get(edgeId);
    if (!socketsForEdge || socketsForEdge.size === 0) {
        return 0;
    }

    const sockets = Array.from(socketsForEdge);
    for (const socket of sockets) {
        socket.emit('edge_disconnect', { edgeId, reason });
        socket.disconnect(true);
    }

    return sockets.length;
}

export function resetActiveEdgeSocketsForTests(): void {
    activeEdgeSockets.clear();
}

function attachAuthenticatedEdgeContext(
    socket: Socket,
    context: AuthenticatedEdgeContext,
): void {
    socket.data['edgeId'] = context.edgeId;
    socket.data['credentialMode'] = context.credentialMode;
    socket.data['lifecycleState'] = context.lifecycleState;
    socket.data['edgeActivation'] = context.edgeActivation;
}

async function edgeAuthMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
    const payload = normalizeEdgeAuthPayload(socket);
    if (!payload) {
        next(new Error('invalid_credential'));
        return;
    }

    try {
        const authResult = await EdgeOnboardingService.authenticateEdgeHandshake({
            edgeId: payload.edgeId,
            credentialMode: payload.credentialMode,
            credentialSecret: payload.credentialSecret,
        });

        if (!authResult.ok) {
            next(new Error(authResult.code));
            return;
        }

        attachAuthenticatedEdgeContext(socket, authResult);
        next();
    } catch (error) {
        console.error('[edge-auth] Unexpected error during middleware:', error);
        next(new Error('edge_auth_internal_error'));
    }
}

export function registerEdgeNamespace(io: IOServer): void {
    const edgeNs = io.of(EDGE_NAMESPACE);

    edgeNs.use((socket, next) => {
        void edgeAuthMiddleware(socket, next);
    });

    edgeNs.on('connection', (socket) => {
        const edgeId = String(socket.data['edgeId'] ?? '');
        if (!edgeId) {
            socket.disconnect(true);
            return;
        }

        trackActiveEdgeSocket(edgeId, socket);
        console.log(`[edge] Edge connected: ${edgeId} (socket: ${socket.id})`);

        const edgeActivation = socket.data['edgeActivation'] as EdgeActivationPayload | null | undefined;
        if (edgeActivation) {
            socket.emit('edge_activation', edgeActivation);
            socket.data['edgeActivation'] = null;
        }

        updateLastSeen(edgeId);
        registerTelemetryHandler(socket, io, edgeId);

        socket.on('disconnect', (reason: string) => {
            untrackActiveEdgeSocket(edgeId, socket);
            console.log(`[edge] Edge disconnected: ${edgeId} - reason: ${reason}`);
            io.to(edgeId).emit('edge_status', { edgeId, online: false });
        });

        socket.on('error', (err: Error) => {
            console.error(`[edge] Socket error (${edgeId}):`, err.message);
        });
    });

    console.log(`[edge] Namespace "${EDGE_NAMESPACE}" registered`);
}
