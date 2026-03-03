import { type Server as IOServer } from 'socket.io';
import { Telemetry, type ITelemetryDoc } from '../models/Telemetry';

// ── Types ─────────────────────────────────────────────────────────────────

export interface TelemetryReading {
    sourceId: string;
    deviceId: string;
    metric: string;
    value: number | boolean;
    ts: number; // Unix ms timestamp from the edge packet
}

/** Composite key for the in-memory aggregation window. */
type AggKey = `${string}:${string}:${string}:${string}`; // edgeId:sourceId:deviceId:metric

interface AggEntry {
    edgeId: string;
    sourceId: string;
    deviceId: string;
    metric: string;
    min: number;
    max: number;
    last: number | boolean;
    sum: number;
    count: number;
    latestTs: number;
}

// ── Constants ─────────────────────────────────────────────────────────────

const WINDOW_MS = 1_000; // 1 000 ms sliding window
/** Hard cap on unique aggregation keys per window — prevents OOM from malicious edge flood. */
const WINDOW_MAX_KEYS = 50_000;

// ── Aggregation Window ────────────────────────────────────────────────────

/**
 * In-memory map: composite key → aggregated bucket.
 *
 * Populated by `ingest()`, drained every WINDOW_MS by `startDrainLoop()`.
 * Must NOT grow unboundedly — drain removes all keys on each tick.
 */
const window = new Map<AggKey, AggEntry>();

// ── Helpers ───────────────────────────────────────────────────────────────

function makeKey(edgeId: string, r: TelemetryReading): AggKey {
    return `${edgeId}:${r.sourceId}:${r.deviceId}:${r.metric}`;
}

function numericValue(v: number | boolean): number {
    return typeof v === 'boolean' ? (v ? 1 : 0) : v;
}

// ── Core API ──────────────────────────────────────────────────────────────

/**
 * Ingests a batch of readings from one edge push into the aggregation window.
 * Called by the WebSocket edge handler AFTER broadcasting to dashboard clients.
 *
 * @param edgeId   EdgeServer._id string (room name)
 * @param readings Array of telemetry points from the edge packet
 */
function ingest(edgeId: string, readings: TelemetryReading[]): void {
    for (const r of readings) {
        // OOM guard: if window is at capacity, drop remaining readings for this batch
        if (window.size >= WINDOW_MAX_KEYS) {
            console.warn(`[TelemetryAggregator] Window cap (${WINDOW_MAX_KEYS}) reached — dropping readings`);
            break;
        }
        const key = makeKey(edgeId, r);
        const num = numericValue(r.value);
        const existing = window.get(key);

        if (existing) {
            existing.min = Math.min(existing.min, num);
            existing.max = Math.max(existing.max, num);
            existing.last = r.value;
            existing.sum += num;
            existing.count += 1;
            existing.latestTs = Math.max(existing.latestTs, r.ts);
        } else {
            window.set(key, {
                edgeId,
                sourceId: r.sourceId,
                deviceId: r.deviceId,
                metric: r.metric,
                min: num,
                max: num,
                last: r.value,
                sum: num,
                count: 1,
                latestTs: r.ts,
            });
        }
    }
}

/**
 * Drains the current aggregation window into MongoDB.
 *
 * CRITICAL: DB failures are caught and logged — they MUST NOT affect
 * the broadcast path (which happens before this write) or cause any
 * uncaught rejection.
 *
 * Called by `startDrainLoop` every WINDOW_MS.
 * Exported for testing and manual draining.
 */
async function drain(): Promise<void> {
    if (window.size === 0) return;

    // Atomically snapshot and clear the window
    const entries = [...window.values()];
    window.clear();

    const docs: ITelemetryDoc[] = entries.map((e) => ({
        timestamp: new Date(e.latestTs),
        metadata: {
            edgeId: e.edgeId,
            sourceId: e.sourceId,
            deviceId: e.deviceId,
        },
        metric: e.metric,
        value: e.last,
    }));

    try {
        await Telemetry.insertMany(docs, { ordered: false });
    } catch (err) {
        // DB failure is INTENTIONALLY non-fatal.
        // Broadcasts already happened; only persistence is lost for this window.
        console.error('[TelemetryAggregator] DB write failed (non-fatal):', err);
    }
}

/**
 * Starts the periodic drain loop.
 * Should be called once after Socket.IO is initialized.
 *
 * The returned NodeJS.Timeout reference can be passed to `stopDrainLoop`
 * for cleanup during testing.
 *
 * @param io  Socket.IO server instance (reserved for future per-window emits)
 */
function startDrainLoop(_io: IOServer): NodeJS.Timeout {
    const handle = setInterval(() => {
        // Fire-and-forget: drain() handles its own errors internally
        void drain();
    }, WINDOW_MS);

    console.log(`[TelemetryAggregator] Drain loop started (${WINDOW_MS}ms interval)`);
    return handle;
}

/**
 * Stops the drain loop (call in test teardowns).
 */
function stopDrainLoop(handle: NodeJS.Timeout): void {
    clearInterval(handle);
}

/** Returns the current size of the aggregation window (for tests). */
function windowSize(): number {
    return window.size;
}

// ── Export ────────────────────────────────────────────────────────────────

export const TelemetryAggregatorService = {
    ingest,
    drain,
    startDrainLoop,
    stopDrainLoop,
    windowSize,
};
