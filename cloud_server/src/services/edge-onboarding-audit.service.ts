import mongoose, { type Types } from 'mongoose';
import {
    EdgeOnboardingAudit,
    type EdgeOnboardingAuditActorType,
    type EdgeOnboardingAuditEventType,
    type IEdgeOnboardingAudit,
} from '../models/EdgeOnboardingAudit';
import { AppError } from '../api/middlewares/error.middleware';

interface WriteAuditEventInput {
    edgeId: string;
    type: EdgeOnboardingAuditEventType;
    actorType: EdgeOnboardingAuditActorType;
    actorId?: string | null;
    details?: Record<string, unknown>;
    occurredAt?: Date;
}

interface AdminAuditActionInput {
    edgeId: string;
    adminId: string;
    details?: Record<string, unknown>;
}

interface BlockAuditActionInput extends AdminAuditActionInput {
    reason?: string;
}

function toObjectId(id: string, label: string): Types.ObjectId {
    if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid ${label}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
}

function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> {
    if (!details) return {};
    const clone = { ...details };
    delete clone['secret'];
    delete clone['credentialSecret'];
    delete clone['onboardingSecret'];
    delete clone['persistentSecret'];
    return clone;
}

async function writeEvent(input: WriteAuditEventInput): Promise<IEdgeOnboardingAudit> {
    const event = await EdgeOnboardingAudit.create({
        edgeId: toObjectId(input.edgeId, 'edgeId'),
        type: input.type,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        details: sanitizeDetails(input.details),
        occurredAt: input.occurredAt ?? new Date(),
    });
    return event;
}

async function recordRegistered(input: AdminAuditActionInput): Promise<IEdgeOnboardingAudit> {
    return writeEvent({
        edgeId: input.edgeId,
        type: 'registered',
        actorType: 'admin',
        actorId: input.adminId,
        details: input.details,
    });
}

async function recordOnboardingReset(input: AdminAuditActionInput): Promise<IEdgeOnboardingAudit> {
    return writeEvent({
        edgeId: input.edgeId,
        type: 'onboarding_reset',
        actorType: 'admin',
        actorId: input.adminId,
        details: input.details,
    });
}

async function recordActivationSucceeded(input: {
    edgeId: string;
    edgeActorId?: string;
    details?: Record<string, unknown>;
}): Promise<IEdgeOnboardingAudit> {
    return writeEvent({
        edgeId: input.edgeId,
        type: 'activation_succeeded',
        actorType: 'edge',
        actorId: input.edgeActorId ?? input.edgeId,
        details: input.details,
    });
}

async function recordTrustRevoked(input: AdminAuditActionInput): Promise<IEdgeOnboardingAudit> {
    return writeEvent({
        edgeId: input.edgeId,
        type: 'trust_revoked',
        actorType: 'admin',
        actorId: input.adminId,
        details: input.details,
    });
}

async function recordBlocked(input: BlockAuditActionInput): Promise<IEdgeOnboardingAudit> {
    return writeEvent({
        edgeId: input.edgeId,
        type: 'blocked',
        actorType: 'admin',
        actorId: input.adminId,
        details: {
            reason: input.reason ?? 'manual-block',
            ...input.details,
        },
    });
}

async function recordReenabled(input: AdminAuditActionInput): Promise<IEdgeOnboardingAudit> {
    return writeEvent({
        edgeId: input.edgeId,
        type: 'reenabled',
        actorType: 'admin',
        actorId: input.adminId,
        details: input.details,
    });
}

async function listByEdgeId(
    edgeId: string,
    limit = 100,
): Promise<Array<Pick<IEdgeOnboardingAudit, 'type' | 'actorType' | 'actorId' | 'occurredAt' | 'details'>>> {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const events = await EdgeOnboardingAudit.find({ edgeId: toObjectId(edgeId, 'edgeId') })
        .sort({ occurredAt: -1 })
        .limit(safeLimit)
        .lean()
        .exec();

    return events.map((event) => ({
        type: event.type,
        actorType: event.actorType,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        details: event.details ?? {},
    }));
}

export const EdgeOnboardingAuditService = {
    writeEvent,
    recordRegistered,
    recordOnboardingReset,
    recordActivationSucceeded,
    recordTrustRevoked,
    recordBlocked,
    recordReenabled,
    listByEdgeId,
};
