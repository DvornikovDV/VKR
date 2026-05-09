import { describe, expect, it } from 'vitest';

import { validateAlarmEventPayload } from '../../src/services/alarm-events.validation';

const EDGE_ID = '66336f9be7b3b3b9c6f10001';

function validPayload() {
    return {
        edgeId: EDGE_ID,
        eventType: 'active',
        sourceId: 'source-plc-1',
        deviceId: 'pump-1',
        metric: 'temperature',
        value: 92.5,
        ts: 1_777_777_001,
        detectedAt: 1_777_777_002,
        rule: {
            ruleId: 'temp-high',
            ruleRevision: 'rev-2',
            conditionType: 'high',
            triggerThreshold: 90,
            clearThreshold: 85,
            expectedValue: null,
            severity: 'danger',
            label: 'Pump temperature high',
        },
    };
}

describe('validateAlarmEventPayload', () => {
    it('normalizes a compact trusted alarm_event contract', () => {
        const normalized = validateAlarmEventPayload(EDGE_ID, validPayload());

        expect(normalized).toEqual(validPayload());
    });

    it('preserves the Edge-provided rule label without hidden truncation', () => {
        const longLabel = 'Pump temperature alarm '.repeat(12);
        const payload = {
            ...validPayload(),
            rule: { ...validPayload().rule, label: longLabel },
        };

        const normalized = validateAlarmEventPayload(EDGE_ID, payload);

        expect(normalized?.rule.label).toBe(longLabel);
    });

    it('rejects mismatched edge identity and malformed core contract fields', () => {
        expect(validateAlarmEventPayload(EDGE_ID, { ...validPayload(), edgeId: 'other-edge' })).toBeNull();
        expect(validateAlarmEventPayload(EDGE_ID, { ...validPayload(), eventType: 'ack' })).toBeNull();
        expect(validateAlarmEventPayload(EDGE_ID, { ...validPayload(), value: '92.5' })).toBeNull();
        expect(validateAlarmEventPayload(EDGE_ID, {
            ...validPayload(),
            rule: { ...validPayload().rule, severity: 'critical' },
        })).toBeNull();
    });
});
