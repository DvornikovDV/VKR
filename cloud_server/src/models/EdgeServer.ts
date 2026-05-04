import { Schema, model, type Document, type Types } from 'mongoose';

export const EDGE_LIFECYCLE_STATES = ['Active', 'Blocked'] as const;
export type EdgeLifecycleState = (typeof EDGE_LIFECYCLE_STATES)[number];

export interface EdgeAvailabilitySnapshot {
    online: boolean;
    lastSeenAt: Date | null;
}

export interface EdgePersistentCredentialMetadata {
    version: number;
    secretHash: string;
    issuedAt: Date;
    lastAcceptedAt: Date | null;
}

export interface EdgeCatalogTelemetryMetric {
    deviceId: string;
    metric: string;
    valueType?: 'boolean' | 'number' | 'string';
    label: string;
}

export interface EdgeCatalogCommandCapability {
    deviceId: string;
    commandType: 'set_bool' | 'set_number';
    valueType: 'boolean' | 'number';
    min?: number;
    max?: number;
    reportedMetric: string;
    label: string;
}

export interface EdgeCapabilitiesCatalogSnapshot {
    edgeServerId: string;
    telemetry: EdgeCatalogTelemetryMetric[];
    commands: EdgeCatalogCommandCapability[];
    updatedAt: Date;
}

export interface IEdgeServer extends Document {
    _id: Types.ObjectId;
    name: string;
    trustedUsers: Types.ObjectId[];
    createdBy: Types.ObjectId | null;
    lifecycleState: EdgeLifecycleState;
    availability: EdgeAvailabilitySnapshot;
    persistentCredential: EdgePersistentCredentialMetadata | null;
    latestCapabilitiesCatalog: EdgeCapabilitiesCatalogSnapshot | null;
    lastLifecycleEventAt: Date | null;
    createdAt: Date;
}

const AvailabilitySchema = new Schema<EdgeAvailabilitySnapshot>(
    {
        online: { type: Boolean, default: false },
        lastSeenAt: { type: Date, default: null },
    },
    { _id: false },
);

const PersistentCredentialSchema = new Schema<EdgePersistentCredentialMetadata>(
    {
        version: { type: Number, required: true, min: 1 },
        secretHash: { type: String, required: true },
        issuedAt: { type: Date, required: true },
        lastAcceptedAt: { type: Date, default: null },
    },
    { _id: false },
);

const CatalogTelemetryMetricSchema = new Schema<EdgeCatalogTelemetryMetric>(
    {
        deviceId: { type: String, required: true, trim: true },
        metric: { type: String, required: true, trim: true },
        valueType: {
            type: String,
            enum: ['boolean', 'number', 'string'],
            required: false,
        },
        label: { type: String, required: true, trim: true },
    },
    { _id: false, strict: true },
);

const CatalogCommandCapabilitySchema = new Schema<EdgeCatalogCommandCapability>(
    {
        deviceId: { type: String, required: true, trim: true },
        commandType: {
            type: String,
            enum: ['set_bool', 'set_number'],
            required: true,
        },
        valueType: {
            type: String,
            enum: ['boolean', 'number'],
            required: true,
        },
        min: { type: Number, required: false },
        max: { type: Number, required: false },
        reportedMetric: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
    },
    { _id: false, strict: true },
);

const CapabilitiesCatalogSchema = new Schema<EdgeCapabilitiesCatalogSnapshot>(
    {
        edgeServerId: { type: String, required: true, trim: true },
        telemetry: {
            type: [CatalogTelemetryMetricSchema],
            default: [],
            required: true,
        },
        commands: {
            type: [CatalogCommandCapabilitySchema],
            default: [],
            required: true,
        },
        updatedAt: { type: Date, required: true },
    },
    { _id: false, strict: true },
);

const EdgeServerSchema = new Schema<IEdgeServer>(
    {
        name: {
            type: String,
            required: [true, 'Edge server name is required'],
            trim: true,
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
        lifecycleState: {
            type: String,
            enum: EDGE_LIFECYCLE_STATES,
            default: 'Active',
            required: true,
        },
        availability: {
            type: AvailabilitySchema,
            default: () => ({ online: false, lastSeenAt: null }),
        },
        persistentCredential: {
            type: PersistentCredentialSchema,
            default: null,
        },
        latestCapabilitiesCatalog: {
            type: CapabilitiesCatalogSchema,
            default: null,
        },
        lastLifecycleEventAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
        strict: true,
    },
);

export const EdgeServer = model<IEdgeServer>('EdgeServer', EdgeServerSchema);
