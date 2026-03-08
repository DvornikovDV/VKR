import { Schema, model, type Document, type Types } from 'mongoose';

// ── Types ─────────────────────────────────────────────────────────────────

export interface IEdgeServer extends Document {
    _id: Types.ObjectId;
    name: string;
    /** Bcrypt hash of the API key used by the physical edge device. */
    apiKeyHash: string;
    /** User IDs permitted to subscribe to telemetry from this edge. */
    trustedUsers: Types.ObjectId[];
    /** Admin user ID who registered this edge server. */
    createdBy: Types.ObjectId | null;
    isActive: boolean;
    /** Updated on each incoming WebSocket telemetry batch (in-memory only for ping check). */
    lastSeen: Date | null;
    createdAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────

const EdgeServerSchema = new Schema<IEdgeServer>(
    {
        name: {
            type: String,
            required: [true, 'Edge server name is required'],
            trim: true,
        },
        apiKeyHash: {
            type: String,
            required: [true, 'API key hash is required'],
        },
        trustedUsers: {
            type: [Schema.Types.ObjectId],
            ref: 'User',
            default: [],
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastSeen: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
    },
);

// ── Model ─────────────────────────────────────────────────────────────────

export const EdgeServer = model<IEdgeServer>('EdgeServer', EdgeServerSchema);
