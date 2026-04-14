import { type Server as IOServer } from 'socket.io';
import {
    Telemetry,
    type BooleanTelemetryRollup,
    type ITelemetryDoc,
    type NumericTelemetryRollup,
} from '../models/Telemetry';

export interface TelemetryReading {
    deviceId: string;
    metric: string;
    value: number | boolean;
    ts: number; // Unix ms timestamp from the edge packet
}

type ValueKind = 'numeric' | 'boolean';

type BucketKey = `${string}:${string}:${string}:${number}:${'n' | 'b'}`;

interface BaseBucketEntry {
    edgeId: string;
    deviceId: string;
    metric: string;
    bucketStartMs: number;
    lastTs: number;
}

interface NumericBucketEntry extends BaseBucketEntry {
    kind: 'numeric';
    min: number;
    max: number;
    sum: number;
    count: number;
    last: number;
}

interface BooleanBucketEntry extends BaseBucketEntry {
    kind: 'boolean';
    trueCount: number;
    falseCount: number;
    count: number;
    last: boolean;
}

type BucketEntry = NumericBucketEntry | BooleanBucketEntry;

interface DrainOptions {
    force?: boolean;
    nowMs?: number;
}

const BUCKET_MS = 1_000;
const ALLOWED_LATENESS_MS = 2_000;
const MAX_FUTURE_SKEW_MS = 5_000;
const MAX_PAST_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const WINDOW_MAX_KEYS = 50_000;

const window = new Map<BucketKey, BucketEntry>();

let maxEventTsSeen = 0;
let sealedThroughBucketEndMs = 0;

function getValueKind(value: number | boolean): ValueKind {
    return typeof value === 'number' ? 'numeric' : 'boolean';
}

function bucketStart(ts: number): number {
    return Math.floor(ts / BUCKET_MS) * BUCKET_MS;
}

function makeKey(edgeId: string, reading: TelemetryReading, startMs: number): BucketKey {
    const kindSuffix: 'n' | 'b' = typeof reading.value === 'number' ? 'n' : 'b';
    return `${edgeId}:${reading.deviceId}:${reading.metric}:${startMs}:${kindSuffix}`;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function isTelemetryValue(value: unknown): value is number | boolean {
    return typeof value === 'number' || typeof value === 'boolean';
}

export function isTimestampValid(ts: number, nowMs: number = Date.now()): boolean {
    if (!Number.isFinite(ts) || ts <= 0) {
        return false;
    }

    if (ts > nowMs + MAX_FUTURE_SKEW_MS) {
        return false;
    }

    if (ts < nowMs - MAX_PAST_AGE_MS) {
        return false;
    }

    return true;
}

export function isReadingValid(reading: unknown, nowMs: number = Date.now()): reading is TelemetryReading {
    if (!reading || typeof reading !== 'object') {
        return false;
    }

    const candidate = reading as Partial<TelemetryReading>;
    if (!isNonEmptyString(candidate.deviceId) || !isNonEmptyString(candidate.metric)) {
        return false;
    }

    if (!isTelemetryValue(candidate.value)) {
        return false;
    }

    if (typeof candidate.ts !== 'number' || !Number.isFinite(candidate.ts)) {
        return false;
    }

    return isTimestampValid(candidate.ts, nowMs);
}

function upsertNumericEntry(
    existing: NumericBucketEntry | undefined,
    edgeId: string,
    reading: TelemetryReading,
    startMs: number,
): NumericBucketEntry {
    const numericValue = reading.value as number;

    if (!existing) {
        return {
            kind: 'numeric',
            edgeId,
            deviceId: reading.deviceId,
            metric: reading.metric,
            bucketStartMs: startMs,
            min: numericValue,
            max: numericValue,
            sum: numericValue,
            count: 1,
            last: numericValue,
            lastTs: reading.ts,
        };
    }

    existing.min = Math.min(existing.min, numericValue);
    existing.max = Math.max(existing.max, numericValue);
    existing.sum += numericValue;
    existing.count += 1;
    if (reading.ts >= existing.lastTs) {
        existing.last = numericValue;
        existing.lastTs = reading.ts;
    }
    return existing;
}

function upsertBooleanEntry(
    existing: BooleanBucketEntry | undefined,
    edgeId: string,
    reading: TelemetryReading,
    startMs: number,
): BooleanBucketEntry {
    const booleanValue = reading.value as boolean;

    if (!existing) {
        return {
            kind: 'boolean',
            edgeId,
            deviceId: reading.deviceId,
            metric: reading.metric,
            bucketStartMs: startMs,
            trueCount: booleanValue ? 1 : 0,
            falseCount: booleanValue ? 0 : 1,
            count: 1,
            last: booleanValue,
            lastTs: reading.ts,
        };
    }

    if (booleanValue) {
        existing.trueCount += 1;
    } else {
        existing.falseCount += 1;
    }
    existing.count += 1;
    if (reading.ts >= existing.lastTs) {
        existing.last = booleanValue;
        existing.lastTs = reading.ts;
    }
    return existing;
}

function toTelemetryDoc(entry: BucketEntry): ITelemetryDoc {
    let rollup: NumericTelemetryRollup | BooleanTelemetryRollup;

    if (entry.kind === 'numeric') {
        rollup = {
            kind: 'numeric',
            min: entry.min,
            max: entry.max,
            sum: entry.sum,
            count: entry.count,
            avg: entry.count > 0 ? entry.sum / entry.count : 0,
            last: entry.last,
        };
    } else {
        rollup = {
            kind: 'boolean',
            trueCount: entry.trueCount,
            falseCount: entry.falseCount,
            count: entry.count,
            last: entry.last,
        };
    }

    return {
        timestamp: new Date(entry.bucketStartMs),
        metadata: {
            edgeId: entry.edgeId,
            deviceId: entry.deviceId,
        },
        metric: entry.metric,
        rollup,
    };
}

function computeFlushWatermark(nowMs: number, force: boolean): number {
    if (force) {
        return Number.POSITIVE_INFINITY;
    }

    const eventWatermark =
        maxEventTsSeen > 0
            ? maxEventTsSeen - ALLOWED_LATENESS_MS
            : Number.NEGATIVE_INFINITY;
    const processingWatermark = nowMs - ALLOWED_LATENESS_MS;

    return Math.max(eventWatermark, processingWatermark);
}

function ingest(edgeId: string, readings: TelemetryReading[], nowMs: number = Date.now()): void {
    for (const reading of readings) {
        if (!isReadingValid(reading, nowMs)) {
            console.warn(
                `[TelemetryAggregator] Dropping malformed reading for edge ${edgeId}`,
            );
            continue;
        }

        const startMs = bucketStart(reading.ts);
        const endMs = startMs + BUCKET_MS;

        if (sealedThroughBucketEndMs > 0 && endMs <= sealedThroughBucketEndMs) {
            console.warn(
                `[TelemetryAggregator] Dropping too-late reading for sealed bucket ${new Date(startMs).toISOString()}`,
            );
            continue;
        }

        const key = makeKey(edgeId, reading, startMs);
        if (window.size >= WINDOW_MAX_KEYS && !window.has(key)) {
            console.warn(`[TelemetryAggregator] Window cap (${WINDOW_MAX_KEYS}) reached, dropping readings`);
            break;
        }

        const kind = getValueKind(reading.value);
        if (kind === 'numeric') {
            const existing = window.get(key);
            const next = upsertNumericEntry(
                existing && existing.kind === 'numeric' ? existing : undefined,
                edgeId,
                reading,
                startMs,
            );
            window.set(key, next);
        } else {
            const existing = window.get(key);
            const next = upsertBooleanEntry(
                existing && existing.kind === 'boolean' ? existing : undefined,
                edgeId,
                reading,
                startMs,
            );
            window.set(key, next);
        }

        maxEventTsSeen = Math.max(maxEventTsSeen, reading.ts);
    }
}

async function drain(options: DrainOptions = {}): Promise<void> {
    if (window.size === 0) {
        return;
    }

    const nowMs = options.nowMs ?? Date.now();
    const force = options.force === true;
    const flushWatermark = computeFlushWatermark(nowMs, force);

    const flushingEntries: BucketEntry[] = [];
    let nextSealedThrough = sealedThroughBucketEndMs;

    for (const [key, entry] of window.entries()) {
        const bucketEnd = entry.bucketStartMs + BUCKET_MS;
        if (force || bucketEnd <= flushWatermark) {
            flushingEntries.push(entry);
            window.delete(key);
            nextSealedThrough = Math.max(nextSealedThrough, bucketEnd);
        }
    }

    if (flushingEntries.length === 0) {
        return;
    }

    sealedThroughBucketEndMs = nextSealedThrough;

    const docs = flushingEntries
        .map((entry) => toTelemetryDoc(entry))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    try {
        await Telemetry.insertMany(docs, { ordered: false });
    } catch (err) {
        // DB failures are intentionally non-fatal for realtime delivery.
        console.error('[TelemetryAggregator] DB write failed (non-fatal):', err);
    }
}

function startDrainLoop(_io: IOServer): NodeJS.Timeout {
    const handle = setInterval(() => {
        void drain();
    }, BUCKET_MS);

    console.log(`[TelemetryAggregator] Drain loop started (${BUCKET_MS}ms interval)`);
    return handle;
}

function stopDrainLoop(handle: NodeJS.Timeout): void {
    clearInterval(handle);
}

function windowSize(): number {
    return window.size;
}

function resetForTests(): void {
    window.clear();
    maxEventTsSeen = 0;
    sealedThroughBucketEndMs = 0;
}

export const TelemetryAggregatorService = {
    ingest,
    drain,
    isTimestampValid,
    isReadingValid,
    startDrainLoop,
    stopDrainLoop,
    windowSize,
    resetForTests,
};
