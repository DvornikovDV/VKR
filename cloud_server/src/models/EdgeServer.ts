import { Schema, model, type Document, type Types } from 'mongoose';

export const EDGE_LIFECYCLE_STATES = [
    'Pending First Connection',
    'Active',
    'Re-onboarding Required',
    'Blocked',
] as const;

export type EdgeLifecycleState = (typeof EDGE_LIFECYCLE_STATES)[number];

export const ONBOARDING_PACKAGE_STATUSES = [
    'ready',
    'used',
    'expired',
    'reset',
    'blocked',
] as const;

export type OnboardingPackageStatus = (typeof ONBOARDING_PACKAGE_STATUSES)[number];

export const PERSISTENT_CREDENTIAL_REVOCATION_REASONS = ['recovery', 'block', 'rotate'] as const;
export type PersistentCredentialRevocationReason =
    (typeof PERSISTENT_CREDENTIAL_REVOCATION_REASONS)[number];

export interface EdgeAvailabilitySnapshot {
    online: boolean;
    lastSeenAt: Date | null;
}

export interface EdgeActivationSnapshot {
    firstActivatedAt: Date | null;
    lastActivatedAt: Date | null;
    lastRejectedAt: Date | null;
}

export interface EdgeOnboardingPackageMetadata {
    credentialId: string;
    secretHash: string;
    displayHint: string | null;
    issuedAt: Date;
    expiresAt: Date;
    issuedBy: Types.ObjectId | null;
    status: OnboardingPackageStatus;
    usedAt: Date | null;
    supersededByCredentialId: string | null;
}

export interface EdgePersistentCredentialMetadata {
    version: number;
    secretHash: string;
    issuedAt: Date;
    lastAcceptedAt: Date | null;
    revokedAt: Date | null;
    revocationReason: PersistentCredentialRevocationReason | null;
}

export interface IEdgeServer extends Document {
    _id: Types.ObjectId;
    name: string;
    trustedUsers: Types.ObjectId[];
    createdBy: Types.ObjectId | null;
    lifecycleState: EdgeLifecycleState;
    availability: EdgeAvailabilitySnapshot;
    activation: EdgeActivationSnapshot;
    currentOnboardingPackage: EdgeOnboardingPackageMetadata | null;
    persistentCredential: EdgePersistentCredentialMetadata | null;
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

const ActivationSchema = new Schema<EdgeActivationSnapshot>(
    {
        firstActivatedAt: { type: Date, default: null },
        lastActivatedAt: { type: Date, default: null },
        lastRejectedAt: { type: Date, default: null },
    },
    { _id: false },
);

const OnboardingPackageSchema = new Schema<EdgeOnboardingPackageMetadata>(
    {
        credentialId: { type: String, required: true, trim: true },
        secretHash: { type: String, required: true },
        displayHint: { type: String, default: null },
        issuedAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true },
        issuedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        status: {
            type: String,
            enum: ONBOARDING_PACKAGE_STATUSES,
            required: true,
        },
        usedAt: { type: Date, default: null },
        supersededByCredentialId: { type: String, default: null },
    },
    { _id: false },
);

const PersistentCredentialSchema = new Schema<EdgePersistentCredentialMetadata>(
    {
        version: { type: Number, required: true, min: 1 },
        secretHash: { type: String, required: true },
        issuedAt: { type: Date, required: true },
        lastAcceptedAt: { type: Date, default: null },
        revokedAt: { type: Date, default: null },
        revocationReason: {
            type: String,
            enum: PERSISTENT_CREDENTIAL_REVOCATION_REASONS,
            default: null,
        },
    },
    { _id: false },
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
            default: 'Pending First Connection',
            required: true,
        },
        availability: {
            type: AvailabilitySchema,
            default: () => ({ online: false, lastSeenAt: null }),
        },
        activation: {
            type: ActivationSchema,
            default: () => ({
                firstActivatedAt: null,
                lastActivatedAt: null,
                lastRejectedAt: null,
            }),
        },
        currentOnboardingPackage: {
            type: OnboardingPackageSchema,
            default: null,
        },
        persistentCredential: {
            type: PersistentCredentialSchema,
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
    },
);

export const EdgeServer = model<IEdgeServer>('EdgeServer', EdgeServerSchema);
