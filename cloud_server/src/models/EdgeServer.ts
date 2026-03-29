import { Schema, model, type Document, type Types } from 'mongoose';
import {
    isLegacyEdgeActive,
    resolveLegacyApiKeyHash,
    resolveLegacyLastSeenTimestamp,
} from '../services/edge-legacy-compat.service';

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
    // Legacy field kept for compatibility during migration tasks.
    apiKeyHash: string;
    trustedUsers: Types.ObjectId[];
    createdBy: Types.ObjectId | null;
    isActive: boolean;
    lastSeen: Date | null;
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

type UpdateContainer = Record<string, unknown>;

function asObject(value: unknown): UpdateContainer | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as UpdateContainer;
}

function asDate(value: unknown): Date | null {
    if (value instanceof Date) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
}

function asLifecycleState(value: unknown): EdgeLifecycleState | null {
    if (typeof value !== 'string') {
        return null;
    }

    return (EDGE_LIFECYCLE_STATES as readonly string[]).includes(value)
        ? (value as EdgeLifecycleState)
        : null;
}

function asSecretHashContainer(secretHash: unknown): { secretHash?: string | null } | null {
    if (typeof secretHash !== 'string') {
        return null;
    }

    return { secretHash };
}

async function synchronizeLegacyCompatibilityInUpdate(
    context: {
        model: any;
        getQuery: () => unknown;
        getUpdate: () => unknown;
        setUpdate: (update: any) => void;
    },
): Promise<void> {
    const updateRecord = asObject(context.getUpdate());
    if (!updateRecord) {
        return;
    }

    const setRecord = asObject(updateRecord['$set']);
    if (!setRecord) {
        return;
    }

    type ExistingProjection = {
        lifecycleState?: EdgeLifecycleState;
        apiKeyHash?: string;
        lastSeen?: Date | null;
        availability?: { lastSeenAt?: Date | null } | null;
        currentOnboardingPackage?: { secretHash?: string | null } | null;
        persistentCredential?: { secretHash?: string | null } | null;
    };

    const query = context.getQuery();
    const existing = (await context.model
        .findOne(query)
        .select(
            'lifecycleState apiKeyHash lastSeen availability.lastSeenAt currentOnboardingPackage.secretHash persistentCredential.secretHash',
        )
        .lean()
        .exec()) as ExistingProjection | null;

    const lifecycleState = asLifecycleState(setRecord['lifecycleState'] ?? existing?.lifecycleState ?? null);

    if (lifecycleState) {
        setRecord['isActive'] = isLegacyEdgeActive(lifecycleState);
    }

    const availabilityPatch = asObject(setRecord['availability']);
    const availabilityLastSeen = asDate(
        setRecord['availability.lastSeenAt'] ?? availabilityPatch?.['lastSeenAt'] ?? null,
    );
    const legacyLastSeen = asDate(setRecord['lastSeen'] ?? null);
    const resolvedLastSeenAt = resolveLegacyLastSeenTimestamp({
        availabilityLastSeenAt: availabilityLastSeen ?? existing?.availability?.lastSeenAt ?? null,
        lastSeen: legacyLastSeen ?? existing?.lastSeen ?? null,
    });

    setRecord['availability.lastSeenAt'] = resolvedLastSeenAt;
    setRecord['lastSeen'] = resolvedLastSeenAt;

    if (lifecycleState) {
        const currentApiKeyHash =
            typeof setRecord['apiKeyHash'] === 'string'
                ? setRecord['apiKeyHash']
                : typeof existing?.apiKeyHash === 'string'
                    ? existing.apiKeyHash
                    : '';

        const onboardingSecretHash =
            setRecord['currentOnboardingPackage.secretHash'] ??
            asObject(setRecord['currentOnboardingPackage'])?.['secretHash'] ??
            existing?.currentOnboardingPackage?.secretHash ??
            null;
        const persistentSecretHash =
            setRecord['persistentCredential.secretHash'] ??
            asObject(setRecord['persistentCredential'])?.['secretHash'] ??
            existing?.persistentCredential?.secretHash ??
            null;

        setRecord['apiKeyHash'] = resolveLegacyApiKeyHash({
            lifecycleState,
            apiKeyHash: currentApiKeyHash,
            currentOnboardingPackage: asSecretHashContainer(onboardingSecretHash),
            persistentCredential: asSecretHashContainer(persistentSecretHash),
        });
    }

    context.setUpdate(updateRecord);
}

EdgeServerSchema.pre('validate', function syncLegacyCompatibilityFields(next) {
    const resolvedLastSeenAt = resolveLegacyLastSeenTimestamp({
        availabilityLastSeenAt: this.availability?.lastSeenAt ?? null,
        lastSeen: this.lastSeen ?? null,
    });

    this.availability = {
        ...(this.availability ?? { online: false, lastSeenAt: null }),
        lastSeenAt: resolvedLastSeenAt,
    };
    this.lastSeen = resolvedLastSeenAt;

    this.isActive = isLegacyEdgeActive(this.lifecycleState);
    this.apiKeyHash = resolveLegacyApiKeyHash({
        lifecycleState: this.lifecycleState,
        availabilityLastSeenAt: this.availability.lastSeenAt,
        lastSeen: this.lastSeen,
        apiKeyHash: this.apiKeyHash,
        currentOnboardingPackage: this.currentOnboardingPackage,
        persistentCredential: this.persistentCredential,
    });

    next();
});

EdgeServerSchema.pre('updateOne', function syncLegacyCompatibilityForUpdateOne(next) {
    void synchronizeLegacyCompatibilityInUpdate({
        model: this.model,
        getQuery: () => this.getQuery(),
        getUpdate: () => this.getUpdate(),
        setUpdate: (update) => this.setUpdate(update as any),
    })
        .then(() => next())
        .catch(next);
});

EdgeServerSchema.pre('findOneAndUpdate', function syncLegacyCompatibilityForFindOneAndUpdate(next) {
    void synchronizeLegacyCompatibilityInUpdate({
        model: this.model,
        getQuery: () => this.getQuery(),
        getUpdate: () => this.getUpdate(),
        setUpdate: (update) => this.setUpdate(update as any),
    })
        .then(() => next())
        .catch(next);
});

export const EdgeServer = model<IEdgeServer>('EdgeServer', EdgeServerSchema);
