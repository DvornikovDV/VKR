import mongoose, { Schema, type Connection } from 'mongoose';

// ── Types ─────────────────────────────────────────────────────────────────

export interface ITelemetryDoc {
    timestamp: Date;
    metadata: {
        edgeId: string;
        sourceId: string;
        deviceId: string;
    };
    metric: string;
    /** Aggregated value persisted to the time-series bucket. */
    value: number | boolean;
}

// ── Schema ────────────────────────────────────────────────────────────────

const TelemetrySchema = new Schema<ITelemetryDoc>({
    timestamp: { type: Date, required: true },
    metadata: {
        edgeId: { type: String, required: true },
        sourceId: { type: String, required: true },
        deviceId: { type: String, required: true },
    },
    metric: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
});

// ── Time-Series Collection Bootstrap ─────────────────────────────────────

/**
 * Creates a native MongoDB Time-Series collection for telemetry.
 *
 * MongoDB does NOT allow Mongoose's `model()` to create a time-series
 * collection automatically — the collection must exist BEFORE the first
 * write.  This helper is idempotent: it is safe to call on every startup.
 *
 * Schema options:
 *   - timeField:   "timestamp"  — the field Mongoose maps to
 *   - metaField:   "metadata"   — high-cardinality grouping key
 *   - granularity: "seconds"    — edge pushes ~every 500 ms
 *
 * TTL:
 *   MongoDB time-series TTL is set via `expireAfterSeconds` on the
 *   collection creation options (NOT via a separate index).
 *   7 days = 604800 seconds.
 *
 * @param connection — active Mongoose connection
 */
export async function ensureTelemetryCollection(connection: Connection): Promise<void> {
    const db = connection.db;
    if (!db) {
        throw new Error('[Telemetry] Database connection is not established');
    }

    const collections = await db.listCollections({ name: 'telemetry' }).toArray();

    if (collections.length === 0) {
        await db.createCollection('telemetry', {
            timeseries: {
                timeField: 'timestamp',
                metaField: 'metadata',
                granularity: 'seconds',
            },
            // TTL: discard buckets older than 7 days
            expireAfterSeconds: 604_800,
        });
        console.log('[Telemetry] Native time-series collection created (TTL 7d)');
    }
}

// ── Model ─────────────────────────────────────────────────────────────────

/**
 * Mongoose model backed by the native time-series collection.
 * Use `Telemetry.insertMany()` for bulk writes from the aggregator.
 */
export const Telemetry = mongoose.model<ITelemetryDoc>('Telemetry', TelemetrySchema, 'telemetry');
