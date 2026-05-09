import mongoose from 'mongoose';

import { AppError } from '../api/middlewares/error.middleware';
import { AlarmIncident, type IAlarmIncident } from '../models/AlarmIncident';
import { EdgeServer } from '../models/EdgeServer';
import type {
    AlarmEventPayloadDto,
    AlarmIncidentLifecycleState,
    AlarmIncidentProjectionDto,
} from '../types';

export interface AlarmIncidentIdentity {
    edgeId: string | mongoose.Types.ObjectId;
    ruleId: string;
    deviceId: string;
    metric: string;
}

export interface AlarmIncidentAckInput {
    edgeId: string | mongoose.Types.ObjectId;
    incidentId: string | mongoose.Types.ObjectId;
    acknowledgedBy: string | mongoose.Types.ObjectId;
}

export interface TrustedAlarmIncidentAckInput {
    edgeId: string;
    incidentId: string;
    userId: string;
}

function toObjectId(value: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId | null {
    if (value instanceof mongoose.Types.ObjectId) {
        return value;
    }

    if (!mongoose.isValidObjectId(value)) {
        return null;
    }

    return new mongoose.Types.ObjectId(value);
}

function toIdString(value: string | mongoose.Types.ObjectId | null): string | null {
    if (value === null) {
        return null;
    }

    return value instanceof mongoose.Types.ObjectId ? value.toHexString() : String(value);
}

function getLifecycleState(incident: Pick<IAlarmIncident, 'isActive' | 'isAcknowledged'>): AlarmIncidentLifecycleState {
    if (incident.isActive && incident.isAcknowledged) {
        return 'active_acknowledged';
    }

    if (incident.isActive) {
        return 'active_unacknowledged';
    }

    return incident.isAcknowledged ? 'closed' : 'cleared_unacknowledged';
}

function getReusableFilter(payload: AlarmEventPayloadDto): Record<string, unknown> | null {
    const edgeId = toObjectId(payload.edgeId);
    if (!edgeId) {
        return null;
    }

    return {
        edgeId,
        ruleId: payload.rule.ruleId,
        deviceId: payload.deviceId,
        metric: payload.metric,
        $or: [{ isActive: true }, { isAcknowledged: false }],
    };
}

function isDuplicateKeyError(error: unknown): boolean {
    return Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 11000,
    );
}

export function projectAlarmIncident(incident: IAlarmIncident): AlarmIncidentProjectionDto {
    return {
        incidentId: incident._id.toHexString(),
        edgeId: incident.edgeId.toHexString(),
        sourceId: incident.sourceId,
        deviceId: incident.deviceId,
        metric: incident.metric,
        ruleId: incident.ruleId,
        lifecycleState: getLifecycleState(incident),
        isActive: incident.isActive,
        isAcknowledged: incident.isAcknowledged,
        activatedAt: incident.activatedAt.toISOString(),
        clearedAt: incident.clearedAt?.toISOString() ?? null,
        acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
        acknowledgedBy: toIdString(incident.acknowledgedBy),
        latestValue: incident.latestValue,
        latestTs: incident.latestTs,
        latestDetectedAt: incident.latestDetectedAt,
        rule: {
            ruleId: incident.rule.ruleId,
            ruleRevision: incident.rule.ruleRevision,
            conditionType: incident.rule.conditionType,
            triggerThreshold: incident.rule.triggerThreshold,
            clearThreshold: incident.rule.clearThreshold,
            expectedValue: incident.rule.expectedValue,
            severity: incident.rule.severity,
            label: incident.rule.label,
        },
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
    };
}

export async function findReusableAlarmIncident(
    identity: AlarmIncidentIdentity,
): Promise<IAlarmIncident | null> {
    const edgeId = toObjectId(identity.edgeId);
    if (!edgeId) {
        return null;
    }

    return await AlarmIncident.findOne({
        edgeId,
        ruleId: identity.ruleId,
        deviceId: identity.deviceId,
        metric: identity.metric,
        $or: [{ isActive: true }, { isAcknowledged: false }],
    })
        .sort({ activatedAt: -1, createdAt: -1 })
        .exec();
}

export async function persistActiveAlarmIncident(
    payload: AlarmEventPayloadDto,
): Promise<IAlarmIncident | null> {
    const reusableFilter = getReusableFilter(payload);
    if (!reusableFilter) {
        return null;
    }

    const now = new Date();
    const reusableUpdate = {
        $set: {
            sourceId: payload.sourceId,
            latestValue: payload.value,
            latestTs: payload.ts,
            latestDetectedAt: payload.detectedAt,
            rule: payload.rule,
            isActive: true,
            clearedAt: null,
        },
    };
    const reusableOptions = {
        new: true,
        sort: { activatedAt: -1, createdAt: -1 },
        runValidators: true,
    };

    const reusable = await AlarmIncident.findOneAndUpdate(
        reusableFilter,
        reusableUpdate,
        reusableOptions,
    ).exec();
    if (reusable) {
        return reusable;
    }

    try {
        return await AlarmIncident.create({
            edgeId: reusableFilter.edgeId,
            sourceId: payload.sourceId,
            deviceId: payload.deviceId,
            metric: payload.metric,
            ruleId: payload.rule.ruleId,
            latestValue: payload.value,
            latestTs: payload.ts,
            latestDetectedAt: payload.detectedAt,
            rule: payload.rule,
            isActive: true,
            isAcknowledged: false,
            activatedAt: now,
            clearedAt: null,
            acknowledgedAt: null,
            acknowledgedBy: null,
        });
    } catch (error) {
        if (!isDuplicateKeyError(error)) {
            throw error;
        }

        return await AlarmIncident.findOneAndUpdate(
            reusableFilter,
            reusableUpdate,
            reusableOptions,
        ).exec();
    }
}

export async function persistClearAlarmIncident(
    payload: AlarmEventPayloadDto,
): Promise<IAlarmIncident | null> {
    const reusableFilter = getReusableFilter(payload);
    if (!reusableFilter) {
        return null;
    }

    const cleared = await AlarmIncident.findOneAndUpdate(
        reusableFilter,
        {
            $set: {
                latestValue: payload.value,
                latestTs: payload.ts,
                latestDetectedAt: payload.detectedAt,
                isActive: false,
                clearedAt: new Date(),
            },
        },
        {
            new: true,
            sort: { activatedAt: -1, createdAt: -1 },
            runValidators: true,
        },
    ).exec();

    if (!cleared) {
        console.warn(
            `[alarm-incidents] Ignored clear for edge=${payload.edgeId} rule=${payload.rule.ruleId} device=${payload.deviceId} metric=${payload.metric}: no reusable incident`,
        );
    }

    return cleared;
}

export async function acknowledgeAlarmIncident(
    input: AlarmIncidentAckInput,
): Promise<IAlarmIncident | null> {
    const edgeId = toObjectId(input.edgeId);
    const incidentId = toObjectId(input.incidentId);
    const acknowledgedBy = toObjectId(input.acknowledgedBy);

    if (!edgeId || !incidentId || !acknowledgedBy) {
        return null;
    }

    const ownershipFilter = {
        _id: incidentId,
        edgeId,
    };

    const acknowledged = await AlarmIncident.findOneAndUpdate(
        {
            ...ownershipFilter,
            isAcknowledged: false,
        },
        {
            $set: {
                isAcknowledged: true,
                acknowledgedAt: new Date(),
                acknowledgedBy,
            },
        },
        {
            new: true,
            runValidators: true,
        },
    ).exec();

    if (acknowledged) {
        return acknowledged;
    }

    return await AlarmIncident.findOne(ownershipFilter).exec();
}

export async function acknowledgeTrustedAlarmIncident(
    input: TrustedAlarmIncidentAckInput,
): Promise<IAlarmIncident> {
    const edgeId = toObjectId(input.edgeId);
    const incidentId = toObjectId(input.incidentId);
    const userId = toObjectId(input.userId);

    if (!edgeId) {
        throw new AppError('Invalid edgeId', 400);
    }

    if (!incidentId) {
        throw new AppError('Invalid incidentId', 400);
    }

    if (!userId) {
        throw new AppError('Invalid userId', 400);
    }

    const edgeServer = await EdgeServer.findById(edgeId)
        .select('trustedUsers')
        .lean<{ trustedUsers: mongoose.Types.ObjectId[] } | null>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    const isTrusted = edgeServer.trustedUsers.some((trustedUserId) => trustedUserId.equals(userId));
    if (!isTrusted) {
        throw new AppError('Access denied: user is not trusted for this edge server', 403);
    }

    const incident = await acknowledgeAlarmIncident({
        edgeId,
        incidentId,
        acknowledgedBy: userId,
    });

    if (!incident) {
        throw new AppError('Alarm incident not found', 404);
    }

    return incident;
}
