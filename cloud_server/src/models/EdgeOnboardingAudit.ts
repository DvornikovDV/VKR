import { Schema, model, type Document, type Types } from 'mongoose';

export const EDGE_ONBOARDING_AUDIT_EVENT_TYPES = [
    'registered',
    'onboarding_issued',
    'onboarding_reset',
    'onboarding_expired',
    'activation_succeeded',
    'activation_rejected',
    'persistent_issued',
    'trust_revoked',
    'blocked',
    'reenabled',
] as const;

export type EdgeOnboardingAuditEventType = (typeof EDGE_ONBOARDING_AUDIT_EVENT_TYPES)[number];

export const EDGE_ONBOARDING_AUDIT_ACTOR_TYPES = ['admin', 'edge', 'system'] as const;
export type EdgeOnboardingAuditActorType = (typeof EDGE_ONBOARDING_AUDIT_ACTOR_TYPES)[number];

export interface IEdgeOnboardingAudit extends Document {
    _id: Types.ObjectId;
    edgeId: Types.ObjectId;
    type: EdgeOnboardingAuditEventType;
    actorType: EdgeOnboardingAuditActorType;
    actorId: string | null;
    occurredAt: Date;
    details: Record<string, unknown>;
    createdAt: Date;
}

const EdgeOnboardingAuditSchema = new Schema<IEdgeOnboardingAudit>(
    {
        edgeId: {
            type: Schema.Types.ObjectId,
            ref: 'EdgeServer',
            required: true,
            index: true,
            immutable: true,
        },
        type: {
            type: String,
            enum: EDGE_ONBOARDING_AUDIT_EVENT_TYPES,
            required: true,
            index: true,
            immutable: true,
        },
        actorType: {
            type: String,
            enum: EDGE_ONBOARDING_AUDIT_ACTOR_TYPES,
            required: true,
            immutable: true,
        },
        actorId: {
            type: String,
            default: null,
            immutable: true,
        },
        occurredAt: {
            type: Date,
            default: () => new Date(),
            index: true,
            immutable: true,
        },
        details: {
            type: Schema.Types.Mixed,
            default: {},
            immutable: true,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
        minimize: false,
    },
);

EdgeOnboardingAuditSchema.index({ edgeId: 1, occurredAt: -1 });

export const EdgeOnboardingAudit = model<IEdgeOnboardingAudit>(
    'EdgeOnboardingAudit',
    EdgeOnboardingAuditSchema,
);
