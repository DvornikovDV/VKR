import bcrypt from 'bcrypt';
import { type Server as IOServer, type Socket } from 'socket.io';
import { EdgeServer } from '../../models/EdgeServer';
import { updateLastSeen } from '../../services/edge-servers.service';
import { registerTelemetryHandler } from './telemetry';

export const EDGE_NAMESPACE = '/edge';

export type EdgeCredentialMode = 'onboarding' | 'persistent';

type EdgeAuthPayload = {
    edgeId: string;
    credentialMode: EdgeCredentialMode;
    credentialSecret: string;
};

const activeEdgeSockets = new Map<string, Set<Socket>>();

function normalizeEdgeAuthPayload(socket: Socket): EdgeAuthPayload | null {
    const auth = socket.handshake.auth as Record<string, unknown> | undefined;

    const edgeId = typeof auth?.['edgeId'] === 'string' ? auth['edgeId'].trim() : '';
    const credentialMode = auth?.['credentialMode'];
    const credentialSecret =
        typeof auth?.['credentialSecret'] === 'string' ? auth['credentialSecret'].trim() : '';

    const hasValidMode = credentialMode === 'onboarding' || credentialMode === 'persistent';

    if (!edgeId || !hasValidMode || !credentialSecret) {
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

export function disconnectEdgeSockets(edgeId: string, reason = 'edge_forced_disconnect'): number {
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

async function edgeAuthMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
    const payload = normalizeEdgeAuthPayload(socket);
    if (!payload) {
        next(new Error('invalid_credential'));
        return;
    }

    try {
        const edge = await EdgeServer.findById(payload.edgeId)
            .select('apiKeyHash isActive lifecycleState')
            .exec();

        if (!edge) {
            next(new Error('edge_not_found'));
            return;
        }

        if (edge.lifecycleState === 'Blocked' || !edge.isActive) {
            next(new Error('blocked'));
            return;
        }

        const valid = await bcrypt.compare(payload.credentialSecret, edge.apiKeyHash);
        if (!valid) {
            next(new Error('invalid_credential'));
            return;
        }

        socket.data['edgeId'] = payload.edgeId;
        socket.data['credentialMode'] = payload.credentialMode;
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
