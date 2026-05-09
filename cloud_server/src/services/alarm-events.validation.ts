import {
    ALARM_CONDITION_TYPES,
    ALARM_EVENT_TYPES,
    ALARM_SEVERITIES,
    type AlarmConditionType,
    type AlarmEventPayloadDto,
    type AlarmEventType,
    type AlarmExpectedValue,
    type AlarmObservedValue,
    type AlarmRuleSnapshotDto,
    type AlarmSeverity,
} from '../types';
import { normalizeDeviceId, normalizeMetric } from './edge-identity.validation';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function readNonBlankOriginalString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    return value.trim().length > 0 ? value : null;
}

function readObjectIdString(value: unknown): string | null {
    const id = readNonEmptyString(value);
    if (!id || !OBJECT_ID_PATTERN.test(id)) {
        return null;
    }

    return id;
}

function readEventType(value: unknown): AlarmEventType | null {
    return typeof value === 'string' && ALARM_EVENT_TYPES.includes(value as AlarmEventType)
        ? value as AlarmEventType
        : null;
}

function readConditionType(value: unknown): AlarmConditionType | null {
    return typeof value === 'string' && ALARM_CONDITION_TYPES.includes(value as AlarmConditionType)
        ? value as AlarmConditionType
        : null;
}

function readSeverity(value: unknown): AlarmSeverity | null {
    return typeof value === 'string' && ALARM_SEVERITIES.includes(value as AlarmSeverity)
        ? value as AlarmSeverity
        : null;
}

function readFiniteNumber(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    return value;
}

function readNullableFiniteNumber(value: unknown): number | null | undefined {
    if (value === null) {
        return null;
    }

    const numberValue = readFiniteNumber(value);
    return numberValue === null ? undefined : numberValue;
}

function readObservedValue(value: unknown): AlarmObservedValue | null {
    if (typeof value === 'boolean') {
        return value;
    }

    return readFiniteNumber(value);
}

function readExpectedValue(value: unknown): AlarmExpectedValue | undefined {
    if (value === null) {
        return null;
    }

    const observedValue = readObservedValue(value);
    return observedValue === null ? undefined : observedValue;
}

function readRuleSnapshot(value: unknown): AlarmRuleSnapshotDto | null {
    if (!isRecord(value)) {
        return null;
    }

    const ruleId = readNonEmptyString(value['ruleId']);
    const ruleRevision = readNonEmptyString(value['ruleRevision']);
    const conditionType = readConditionType(value['conditionType']);
    const triggerThreshold = readNullableFiniteNumber(value['triggerThreshold']);
    const clearThreshold = readNullableFiniteNumber(value['clearThreshold']);
    const expectedValue = readExpectedValue(value['expectedValue']);
    const severity = readSeverity(value['severity']);
    const label = readNonBlankOriginalString(value['label']);

    if (
        !ruleId ||
        !ruleRevision ||
        !conditionType ||
        triggerThreshold === undefined ||
        clearThreshold === undefined ||
        expectedValue === undefined ||
        !severity ||
        !label
    ) {
        return null;
    }

    return {
        ruleId,
        ruleRevision,
        conditionType,
        triggerThreshold,
        clearThreshold,
        expectedValue,
        severity,
        label,
    };
}

export function validateAlarmEventPayload(
    authenticatedEdgeId: string,
    payload: unknown,
): AlarmEventPayloadDto | null {
    const trustedEdgeId = readObjectIdString(authenticatedEdgeId);
    if (!trustedEdgeId || !isRecord(payload)) {
        return null;
    }

    const edgeId = readObjectIdString(payload['edgeId']);
    if (edgeId !== trustedEdgeId) {
        return null;
    }

    const eventType = readEventType(payload['eventType']);
    const sourceId = readNonEmptyString(payload['sourceId']);
    const deviceId = normalizeDeviceId(payload['deviceId']);
    const metric = normalizeMetric(payload['metric']);
    const value = readObservedValue(payload['value']);
    const ts = readFiniteNumber(payload['ts']);
    const detectedAt = readFiniteNumber(payload['detectedAt']);
    const rule = readRuleSnapshot(payload['rule']);

    if (
        !eventType ||
        !sourceId ||
        !deviceId ||
        !metric ||
        value === null ||
        ts === null ||
        detectedAt === null ||
        !rule
    ) {
        return null;
    }

    return {
        edgeId,
        eventType,
        sourceId,
        deviceId,
        metric,
        value,
        ts,
        detectedAt,
        rule,
    };
}
