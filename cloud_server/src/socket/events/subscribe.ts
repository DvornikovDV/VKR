import { type Socket } from 'socket.io';
import { EdgeServer } from '../../models/EdgeServer';
import mongoose from 'mongoose';

// ── Types ─────────────────────────────────────────────────────────────────

interface SubscribePayload {
    edgeId?: unknown;
}

// ── Handler ───────────────────────────────────────────────────────────────

/**
 * Registers handler for the `subscribe` event on an authenticated dashboard socket.
 *
 * Flow:
 *   1. Client emits `subscribe` with `{ edgeId: string }`.
 *   2. Server validates that the authenticated user is in `EdgeServer.trustedUsers`.
 *   3. On success: socket joins the room keyed by `edgeId`.
 *   4. On failure: emits `error` back to the requesting socket only.
 *
 * Room naming: identical to the edgeId string —
 *   edge handler (T031) broadcasts to the same room via `io.to(edgeId)`.
 *
 * Authorization: the JWT user embedded in `socket.data.userId` MUST be present
 * in the EdgeServer's `trustedUsers` array, otherwise the subscription is denied.
 *
 * @param socket - Authenticated dashboard socket (data populated by jwtSocketMiddleware)
 */
export function registerSubscribeHandler(socket: Socket): void {
    socket.on('subscribe', async (payload: SubscribePayload) => {
        const edgeId = payload?.edgeId;

        // ── Basic validation ──────────────────────────────────────────────
        if (typeof edgeId !== 'string' || !edgeId.trim()) {
            socket.emit('error', { message: 'subscribe: edgeId is required' });
            return;
        }

        if (!mongoose.isValidObjectId(edgeId)) {
            socket.emit('error', { message: 'subscribe: edgeId must be a valid ObjectId' });
            return;
        }

        // ── Authorization check ───────────────────────────────────────────
        const userId = socket.data?.userId as string | undefined;
        if (!userId) {
            socket.emit('error', { message: 'subscribe: not authenticated' });
            return;
        }

        try {
            const edge = await EdgeServer.findById(edgeId)
                .select('trustedUsers')
                .lean()
                .exec();

            if (!edge) {
                socket.emit('error', { message: 'subscribe: edge server not found' });
                return;
            }

            const userObjId = new mongoose.Types.ObjectId(userId);
            const isTrusted = edge.trustedUsers.some((id) =>
                new mongoose.Types.ObjectId(id).equals(userObjId),
            );

            if (!isTrusted) {
                socket.emit('error', { message: 'subscribe: access denied' });
                return;
            }

            // ── Join room ─────────────────────────────────────────────────
            await socket.join(edgeId);
            socket.emit('subscribed', { edgeId });
            console.log(`[subscribe] Socket ${socket.id} joined room: ${edgeId}`);
        } catch (err) {
            console.error('[subscribe] Error during authorization check:', err);
            socket.emit('error', { message: 'subscribe: internal server error' });
        }
    });
}
