import { type Server as IOServer, type Socket } from 'socket.io';
import { clearConnectivityAlarmIncident } from '../../services/connectivity-alarm.service';
import { markEdgeOffline } from '../../services/edge-servers.service';
import { authenticatePersistentEdgeRuntime } from './edge-runtime-auth';
import {
    attachAuthenticatedEdgeContext,
    isTrustedEdgeSocket,
    markTrustedSessionLost,
    shouldSkipOfflineTransition,
} from './edge-runtime-session';
import { registerCommandResultHandler } from './command';
import { registerTelemetryHandler } from './telemetry';
import { registerCapabilitiesCatalogHandler } from './capabilities';
import { emitAlarmIncidentChanged, registerAlarmEventHandler } from './alarm';

export const EDGE_NAMESPACE = '/edge';

export type EdgeForcedDisconnectReason = 'edge_forced_disconnect' | 'credential_rotated' | 'blocked';

const activeEdgeSockets = new Map<string, Socket>();
const pendingAuthenticatedEdgeSockets = new Map<string, Socket>();

function trackActiveEdgeSocket(edgeId: string, socket: Socket): boolean {
    const existing = activeEdgeSockets.get(edgeId);
    if (existing && existing !== socket) {
        return false;
    }

    activeEdgeSockets.set(edgeId, socket);
    return true;
}

function trackPendingAuthenticatedEdgeSocket(edgeId: string, socket: Socket): boolean {
    const existingPending = pendingAuthenticatedEdgeSockets.get(edgeId);
    if (existingPending && existingPending !== socket) {
        return false;
    }

    if (activeEdgeSockets.has(edgeId) && activeEdgeSockets.get(edgeId) !== socket) {
        return false;
    }

    pendingAuthenticatedEdgeSockets.set(edgeId, socket);
    return true;
}

function untrackActiveEdgeSocket(edgeId: string, socket: Socket): void {
    if (activeEdgeSockets.get(edgeId) === socket) {
        activeEdgeSockets.delete(edgeId);
    }
}

function untrackPendingAuthenticatedEdgeSocket(edgeId: string, socket: Socket): void {
    if (pendingAuthenticatedEdgeSockets.get(edgeId) === socket) {
        pendingAuthenticatedEdgeSockets.delete(edgeId);
    }
}

function promoteAuthenticatedEdgeSocket(edgeId: string, socket: Socket): boolean {
    untrackPendingAuthenticatedEdgeSocket(edgeId, socket);
    return trackActiveEdgeSocket(edgeId, socket);
}

function getTrackedEdgeSockets(edgeId: string): Socket[] {
    const trackedSockets = new Set<Socket>();

    const activeSocket = activeEdgeSockets.get(edgeId);
    if (activeSocket) {
        trackedSockets.add(activeSocket);
    }

    const pendingSocket = pendingAuthenticatedEdgeSockets.get(edgeId);
    if (pendingSocket) {
        trackedSockets.add(pendingSocket);
    }

    return Array.from(trackedSockets);
}

export function getActiveEdgeSocketCount(edgeId?: string): number {
    if (edgeId) {
        return activeEdgeSockets.has(edgeId) ? 1 : 0;
    }

    return activeEdgeSockets.size;
}

export function getActiveTrustedEdgeSocket(edgeId: string): Socket | null {
    const socket = activeEdgeSockets.get(edgeId);
    if (!socket || !isTrustedEdgeSocket(socket, edgeId)) {
        return null;
    }

    return socket;
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
        untrackActiveEdgeSocket(edgeId, socket);
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
        const reserved = trackPendingAuthenticatedEdgeSocket(authResult.context.edgeId, socket);
        if (!reserved) {
            next(new Error('invalid_credential'));
            return;
        }
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

        if (!promoteAuthenticatedEdgeSocket(edgeId, socket)) {
            socket.disconnect(true);
            return;
        }
        void clearConnectivityAlarmIncident(edgeId, new Date())
            .then((incident) => {
                if (incident) {
                    emitAlarmIncidentChanged(io, edgeId, incident);
                }
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[edge] Failed to clear connectivity alarm for edge ${edgeId}: ${message}`);
            });
        console.log(`[edge] Edge connected: ${edgeId} (socket: ${socket.id})`);

        registerTelemetryHandler(socket, io, edgeId);
        registerCommandResultHandler(socket, edgeId);
        registerCapabilitiesCatalogHandler(socket, edgeId);
        registerAlarmEventHandler(socket, io, edgeId);

        socket.on('disconnect', (reason: string) => {
            untrackActiveEdgeSocket(edgeId, socket);
            untrackPendingAuthenticatedEdgeSocket(edgeId, socket);
            markTrustedSessionLost(socket);
            console.log(`[edge] Edge disconnected: ${edgeId} - reason: ${reason}`);
            if (getActiveEdgeSocketCount(edgeId) === 0 && !shouldSkipOfflineTransition(socket)) {
                void markEdgeOffline(edgeId).then((lastSeenAt) => {
                    io.to(edgeId).emit('edge_status', {
                        edgeId,
                        online: false,
                        lastSeenAt: lastSeenAt?.toISOString() ?? null,
                    });
                }).catch((error) => {
                    console.error(`[edge] Failed to mark edge offline (${edgeId}):`, error);
                });
            }
        });

        socket.on('error', (err: Error) => {
            console.error(`[edge] Socket error (${edgeId}):`, err.message);
        });
    });

    console.log(`[edge] Namespace "${EDGE_NAMESPACE}" registered`);
}
