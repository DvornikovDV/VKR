import mongoose, { Schema, type Connection } from 'mongoose';

// Types

export interface NumericTelemetryRollup {
    kind: 'numeric';
    min: number;
    max: number;
    sum: number;
    count: number;
    avg: number;
    last: number;
}

export interface BooleanTelemetryRollup {
    kind: 'boolean';
    trueCount: number;
    falseCount: number;
    count: number;
    last: boolean;
}

export type TelemetryRollup = NumericTelemetryRollup | BooleanTelemetryRollup;

export interface ITelemetryDoc {
    /** Bucket start (UTC), snapped to a 1-second event-time boundary. */
    timestamp: Date;
    metadata: {
        edgeId: string;
        sourceId: string;
        deviceId: string;
    };
    metric: string;
    /**
     * Event-time rollup payload for this edge/source/device/metric bucket.
     * Numeric series keep min/max/sum/count/avg/last.
     * Boolean series keep true/false counts and last.
     */
    rollup: TelemetryRollup;
}

// Schema

const TelemetrySchema = new Schema<ITelemetryDoc>({
    timestamp: { type: Date, required: true },
    metadata: {
        edgeId: { type: String, required: true },
        sourceId: { type: String, required: true },
        deviceId: { type: String, required: true },
    },
    metric: { type: String, required: true },
    rollup: { type: Schema.Types.Mixed, required: true },
});

// Time-series collection bootstrap

/**
 * Creates a native MongoDB time-series collection for telemetry.
 *
 * MongoDB does not allow Mongoose `model()` to create a time-series
 * collection automatically; the collection must exist before the first write.
 * This helper is idempotent and safe on every startup.
 *
 * Schema options:
 *   - timeField:   "timestamp"  (event-time bucket start)
 *   - metaField:   "metadata"   (edge/source/device grouping key)
 *   - granularity: "seconds"    (1-second rollup buckets)
 *
 * TTL:
 *   Time-series retention is configured with `expireAfterSeconds`
 *   at collection creation time.
 *   7 days = 604800 seconds.
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
            // TTL: discard telemetry history older than 7 days
            expireAfterSeconds: 604_800,
        });
        console.log('[Telemetry] Native time-series collection created (TTL 7d)');
    }
}

// Model

/**
 * Mongoose model backed by the native time-series collection.
 * Use `Telemetry.insertMany()` for bulk writes from the event-time aggregator.
 */
export const Telemetry = mongoose.model<ITelemetryDoc>('Telemetry', TelemetrySchema, 'telemetry');
