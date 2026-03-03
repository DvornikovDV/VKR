import { type Socket, type Server as IOServer } from 'socket.io';
import { TelemetryAggregatorService, type TelemetryReading } from '../../services/telemetry-aggregator.service';
import { updateLastSeen } from '../../services/edge-servers.service';

// ── Types ─────────────────────────────────────────────────────────────────

/** Payload sent by the edge device in each telemetry batch. */
export interface TelemetryBatchPayload {
    readings?: TelemetryReading[];
}

/** Payload broadcast to dashboard clients subscribed to this edge. */
export interface TelemetryBroadcast {
    edgeId: string;
    readings: Array<{
        sourceId: string;
        deviceId: string;
        metric: string;
        last: number | boolean;
        ts: number;
    }>;
    serverTs: number;
}

// ── Handler ───────────────────────────────────────────────────────────────

/**
 * Registers the `telemetry` event listener on an authenticated edge socket.
 *
 * Processing order (CRITICAL — must not be changed):
 *   1. Validate payload structure.
 *   2. Update in-memory lastSeen (used by ping endpoint).
 *   3. BUILD broadcast payload using `last` values from this batch.
 *   4. **BROADCAST FIRST** to dashboard room via `io.to(edgeId).emit(...)`.
 *   5. THEN ingest a copy into the aggregation window (non-blocking).
 *
 * Invariant: DB write failure (in drain loop) MUST NOT affect step 4.
 * The broadcast at step 4 is synchronous — no await, no DB dependency.
 *
 * @param socket  Authenticated edge socket (`socket.data.edgeId` is set)
 * @param io      Root Socket.IO server (needed to emit to dashboard rooms)
 * @param edgeId  Edge server ID string (passed through from connection handler)
 */
export function registerTelemetryHandler(
    socket: Socket,
    io: IOServer,
    edgeId: string,
): void {
    // Per-connection flag: emit 'online' only once — on the first valid telemetry batch.
    // This prevents spurious status flapping in case an edge connects/disconnects
    // rapidly without sending any data (connection flapping defense, Variant A).
    let onlineNotified = false;
    socket.on('telemetry', (payload: TelemetryBatchPayload) => {
        // ── 1. Validate ───────────────────────────────────────────────────
        if (
            !payload ||
            !Array.isArray(payload.readings) ||
            payload.readings.length === 0
        ) {
            console.warn(`[telemetry] Empty or invalid payload from edge ${edgeId}`);
            return;
        }

        const rawReadings = payload.readings;
        const serverTs = Date.now();

        // ── 1b. Validate inner reading elements ───────────────────────────
        // Filter out malformed entries to prevent NaN in aggregation or schema violations.
        const readings = rawReadings.filter((r) =>
            typeof r.sourceId === 'string' && r.sourceId.length > 0 &&
            typeof r.deviceId === 'string' && r.deviceId.length > 0 &&
            typeof r.metric === 'string' && r.metric.length > 0 &&
            (typeof r.value === 'number' || typeof r.value === 'boolean') &&
            typeof r.ts === 'number' && isFinite(r.ts),
        );

        if (readings.length === 0) {
            console.warn(`[telemetry] All readings from edge ${edgeId} failed validation`);
            return;
        }

        // ── 2. Update in-memory lastSeen ──────────────────────────────────
        updateLastSeen(edgeId);

        // ── 3. Notify dashboard on first valid data (Variant A: online on data, not connect) ─
        if (!onlineNotified) {
            onlineNotified = true;
            io.to(edgeId).emit('edge_status', { edgeId, online: true });
        }

        // ── 4. Build broadcast payload ───────────────────────────────────
        const broadcastPayload: TelemetryBroadcast = {
            edgeId,
            readings: readings.map((r) => ({
                sourceId: r.sourceId,
                deviceId: r.deviceId,
                metric: r.metric,
                last: r.value,
                ts: r.ts,
            })),
            serverTs,
        };

        // ── 5. BROADCAST to dashboard clients (no DB dependency) ──────────
        // This emit is ALWAYS executed regardless of DB state.
        // io.to() is synchronous — it merely enqueues data in Socket.IO's
        // internal buffer; the actual send happens in the next event-loop tick.
        io.to(edgeId).emit('telemetry', broadcastPayload);

        // ── 6. Ingest into aggregation window (non-blocking) ──────────────
        // The drain loop will persist this to MongoDB on the next 1000ms tick.
        // Any DB failure during drain is caught internally in the aggregator.
        TelemetryAggregatorService.ingest(edgeId, readings);
    });
}
