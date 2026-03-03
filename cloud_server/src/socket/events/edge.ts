import { type Socket, type Server as IOServer } from 'socket.io';
import bcrypt from 'bcrypt';
import { EdgeServer } from '../../models/EdgeServer';
import { updateLastSeen } from '../../services/edge-servers.service';
import { registerTelemetryHandler } from './telemetry';

// ── Constants ─────────────────────────────────────────────────────────────

/** Namespace for edge device WebSocket connections. */
export const EDGE_NAMESPACE = '/edge';

// ── Authentication ────────────────────────────────────────────────────────

/**
 * Authenticates an edge device socket using the `x-api-key` header.
 *
 * Handshake flow:
 *   Edge sends: `{ headers: { 'x-api-key': '<plaintext-api-key>', 'x-edge-id': '<edgeId>' } }`
 *   Server validates: bcrypt.compare(apiKey, EdgeServer.apiKeyHash)
 *
 * On success: attaches `socket.data.edgeId` and calls next()
 * On failure: calls next(Error) → connection rejected
 */
async function edgeAuthMiddleware(
    socket: Socket,
    next: (err?: Error) => void,
): Promise<void> {
    const apiKey = socket.handshake.headers['x-api-key'];
    const edgeIdHeader = socket.handshake.headers['x-edge-id'];

    if (!apiKey || typeof apiKey !== 'string') {
        next(new Error('Edge auth error: x-api-key header missing'));
        return;
    }

    if (!edgeIdHeader || typeof edgeIdHeader !== 'string') {
        next(new Error('Edge auth error: x-edge-id header missing'));
        return;
    }

    try {
        const edge = await EdgeServer.findById(edgeIdHeader)
            .select('apiKeyHash isActive')
            .exec();

        if (!edge) {
            next(new Error('Edge auth error: edge server not found'));
            return;
        }

        if (!edge.isActive) {
            next(new Error('Edge auth error: edge server is deactivated'));
            return;
        }

        const valid = await bcrypt.compare(apiKey, edge.apiKeyHash);
        if (!valid) {
            next(new Error('Edge auth error: invalid API key'));
            return;
        }

        // Attach authenticated identity to socket data
        socket.data = { edgeId: edgeIdHeader };
        next();
    } catch (err) {
        console.error('[edge-auth] Unexpected error during middleware:', err);
        next(new Error('Edge auth error: internal server error'));
    }
}

// ── Connection handler ────────────────────────────────────────────────────

/**
 * Registers a connection handler on the /edge namespace.
 * Each successfully authenticated edge socket:
 *   1. Updates in-memory lastSeen registry.
 *   2. Broadcasts `edge_status { edgeId, online: true }` to subscribed dashboard clients.
 *   3. Registers the `telemetry` event handler (T032).
 *   4. On disconnect: broadcasts `edge_status { edgeId, online: false }` to dashboard clients.
 *
 * Dashboard clients subscribe to a room keyed by `edgeId` via the `subscribe` event.
 * The `edge_status` event is the authoritative source of truth for equipment online state.
 *
 * @param io  Root Socket.IO server (used to broadcast to dashboard rooms)
 */
export function registerEdgeNamespace(io: IOServer): void {
    const edgeNs = io.of(EDGE_NAMESPACE);

    edgeNs.use((socket, next) => {
        void edgeAuthMiddleware(socket, next);
    });

    edgeNs.on('connection', (socket) => {
        const edgeId = socket.data.edgeId as string;

        console.log(`[edge] Edge connected: ${edgeId} (socket: ${socket.id})`);

        // Record connection time; 'edge_status {online: true}' is deferred to
        // the first valid telemetry batch (Variant A: no flapping on fast connect/disconnect)
        updateLastSeen(edgeId);

        // Register telemetry batch event (T032)
        registerTelemetryHandler(socket, io, edgeId);

        socket.on('disconnect', (reason: string) => {
            console.log(`[edge] Edge disconnected: ${edgeId} — reason: ${reason}`);

            // Notify subscribed dashboard clients that this edge went offline
            io.to(edgeId).emit('edge_status', { edgeId, online: false });
        });

        socket.on('error', (err: Error) => {
            console.error(`[edge] Socket error (${edgeId}):`, err.message);
        });
    });

    console.log(`[edge] Namespace "${EDGE_NAMESPACE}" registered`);
}

