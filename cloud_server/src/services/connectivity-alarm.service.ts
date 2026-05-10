import {
    findReusableAlarmIncident,
    persistActiveAlarmIncident,
    persistClearAlarmIncident,
    projectAlarmIncident,
    type AlarmIncidentIdentity,
} from './alarm-incidents.service';
import type {
    AlarmEventPayloadDto,
    AlarmEventType,
    AlarmIncidentProjectionDto,
    AlarmRuleSnapshotDto,
} from '../types';

export const CONNECTIVITY_ALARM_RULE_ID = 'system.edge_connectivity';
export const CONNECTIVITY_ALARM_RULE_REVISION = 'mvp-1';
export const CONNECTIVITY_ALARM_SOURCE_ID = 'system';
export const CONNECTIVITY_ALARM_DEVICE_ID = 'edge';
export const CONNECTIVITY_ALARM_METRIC = 'connectivity';
export const CONNECTIVITY_ALARM_LABEL = 'Edge connectivity lost';

export type ConnectivityAlarmEventType = AlarmEventType;

export interface ConnectivityAlarmEventInput {
    edgeId: string;
    eventType: ConnectivityAlarmEventType;
    observedAt: Date;
}

export interface ConnectivityAlarmIncidentInput {
    edgeId: string;
    observedAt: Date;
}

export const CONNECTIVITY_ALARM_RULE: AlarmRuleSnapshotDto = {
    ruleId: CONNECTIVITY_ALARM_RULE_ID,
    ruleRevision: CONNECTIVITY_ALARM_RULE_REVISION,
    conditionType: 'connectivity',
    triggerThreshold: null,
    clearThreshold: null,
    expectedValue: null,
    severity: 'danger',
    label: CONNECTIVITY_ALARM_LABEL,
};

export function getConnectivityAlarmIdentity(edgeId: string): AlarmIncidentIdentity {
    return {
        edgeId,
        ruleId: CONNECTIVITY_ALARM_RULE_ID,
        deviceId: CONNECTIVITY_ALARM_DEVICE_ID,
        metric: CONNECTIVITY_ALARM_METRIC,
    };
}

export function buildConnectivityAlarmEvent(
    edgeId: string,
    eventType: ConnectivityAlarmEventType,
    observedAt: Date,
): AlarmEventPayloadDto {
    const observedAtMs = observedAt.getTime();

    return {
        edgeId,
        eventType,
        sourceId: CONNECTIVITY_ALARM_SOURCE_ID,
        deviceId: CONNECTIVITY_ALARM_DEVICE_ID,
        metric: CONNECTIVITY_ALARM_METRIC,
        value: eventType === 'active' ? false : true,
        ts: observedAtMs,
        detectedAt: observedAtMs,
        rule: { ...CONNECTIVITY_ALARM_RULE },
    };
}

export async function activateConnectivityAlarmIncident(
    edgeId: string,
    observedAt: Date,
): Promise<AlarmIncidentProjectionDto | null> {
    const incident = await persistActiveAlarmIncident(
        buildConnectivityAlarmEvent(edgeId, 'active', observedAt),
    );

    return incident ? projectAlarmIncident(incident) : null;
}

export async function clearConnectivityAlarmIncident(
    edgeId: string,
    observedAt: Date,
): Promise<AlarmIncidentProjectionDto | null> {
    const reusableIncident = await findReusableAlarmIncident(getConnectivityAlarmIdentity(edgeId));
    if (!reusableIncident) {
        return null;
    }

    const incident = await persistClearAlarmIncident(
        buildConnectivityAlarmEvent(edgeId, 'clear', observedAt),
    );

    return incident ? projectAlarmIncident(incident) : null;
}
