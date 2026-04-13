import { type Server as IOServer, type Socket } from 'socket.io';
import { markEdgeOffline } from '../../services/edge-servers.service';
import { authenticatePersistentEdgeRuntime } from './edge-runtime-auth';
import {
    attachAuthenticatedEdgeContext,
    markTrustedSessionLost,
    shouldSkipOfflineTransition,
} from './edge-runtime-session';
import { registerTelemetryHandler } from './telemetry';

export const EDGE_NAMESPACE = '/edge';

export type EdgeForcedDisconnectReason = 'edge_forced_disconnect' | 'credential_rotated' | 'blocked';

const activeEdgeSockets = new Map<string, Set<Socket>>();
const pendingAuthenticatedEdgeSockets = new Map<string, Set<Socket>>();

function trackActiveEdgeSocket(edgeId: string, socket: Socket): void {
    const socketsForEdge = activeEdgeSockets.get(edgeId) ?? new Set<Socket>();
    socketsForEdge.add(socket);
    activeEdgeSockets.set(edgeId, socketsForEdge);
}

function trackPendingAuthenticatedEdgeSocket(edgeId: string, socket: Socket): void {
    const socketsForEdge = pendingAuthenticatedEdgeSockets.get(edgeId) ?? new Set<Socket>();
    socketsForEdge.add(socket);
    pendingAuthenticatedEdgeSockets.set(edgeId, socketsForEdge);
}

function untrackActiveEdgeSocket(edgeId: string, socket: Socket): void {
    const socketsForEdge = activeEdgeSockets.get(edgeId);
    if (!socketsForEdge) return;

    socketsForEdge.delete(socket);
    if (socketsForEdge.size === 0) {
        activeEdgeSockets.delete(edgeId);
    }
}

function untrackPendingAuthenticatedEdgeSocket(edgeId: string, socket: Socket): void {
    const socketsForEdge = pendingAuthenticatedEdgeSockets.get(edgeId);
    if (!socketsForEdge) return;

    socketsForEdge.delete(socket);
    if (socketsForEdge.size === 0) {
        pendingAuthenticatedEdgeSockets.delete(edgeId);
    }
}

function promoteAuthenticatedEdgeSocket(edgeId: string, socket: Socket): void {
    untrackPendingAuthenticatedEdgeSocket(edgeId, socket);
    trackActiveEdgeSocket(edgeId, socket);
}

function getTrackedEdgeSockets(edgeId: string): Socket[] {
    const trackedSockets = new Set<Socket>();

    for (const socket of activeEdgeSockets.get(edgeId) ?? []) {
        trackedSockets.add(socket);
    }

    for (const socket of pendingAuthenticatedEdgeSockets.get(edgeId) ?? []) {
        trackedSockets.add(socket);
    }

    return Array.from(trackedSockets);
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
    const sockets = getTrackedEdgeSockets(edgeId);
    if (sockets.length === 0) {
        return 0;
    }

    for (const socket of sockets) {
        markTrustedSessionLost(socket, { skipOfflineTransition: true });
        untrackPendingAuthenticatedEdgeSocket(edgeId, socket);
        socket.emit('edge_disconnect', { edgeId, reason });
        socket.disconnect(true);
    }

    return sockets.length;
}

export function resetActiveEdgeSocketsForTests(): void {
    activeEdgeSockets.clear();
    pendingAuthenticatedEdgeSockets.clear();
}

async function edgeAuthMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
    try {
        const authResult = await authenticatePersistentEdgeRuntime(socket);
        if (!authResult.ok) {
            next(new Error(authResult.code));
            return;
        }

        attachAuthenticatedEdgeContext(socket, authResult.context);
        trackPendingAuthenticatedEdgeSocket(authResult.context.edgeId, socket);
        socket.once('disconnect', () => {
            untrackPendingAuthenticatedEdgeSocket(authResult.context.edgeId, socket);
        });
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

        if (socket.disconnected) {
            untrackPendingAuthenticatedEdgeSocket(edgeId, socket);
            return;
        }

        promoteAuthenticatedEdgeSocket(edgeId, socket);
        console.log(`[edge] Edge connected: ${edgeId} (socket: ${socket.id})`);

        registerTelemetryHandler(socket, io, edgeId);

        socket.on('disconnect', (reason: string) => {
            untrackActiveEdgeSocket(edgeId, socket);
            markTrustedSessionLost(socket);
            console.log(`[edge] Edge disconnected: ${edgeId} - reason: ${reason}`);
            if (getActiveEdgeSocketCount(edgeId) === 0 && !shouldSkipOfflineTransition(socket)) {
                void markEdgeOffline(edgeId).catch((error) => {
                    console.error(`[edge] Failed to mark edge offline (${edgeId}):`, error);
                });
                io.to(edgeId).emit('edge_status', { edgeId, online: false });
            }
        });

        socket.on('error', (err: Error) => {
            console.error(`[edge] Socket error (${edgeId}):`, err.message);
        });
    });

    console.log(`[edge] Namespace "${EDGE_NAMESPACE}" registered`);
}
