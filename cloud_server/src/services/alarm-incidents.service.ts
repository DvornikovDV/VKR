import mongoose from 'mongoose';

import { AlarmIncident, type IAlarmIncident } from '../models/AlarmIncident';
import type {
    AlarmIncidentLifecycleState,
    AlarmIncidentProjectionDto,
} from '../types';

export interface AlarmIncidentIdentity {
    edgeId: string | mongoose.Types.ObjectId;
    ruleId: string;
    deviceId: string;
    metric: string;
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
