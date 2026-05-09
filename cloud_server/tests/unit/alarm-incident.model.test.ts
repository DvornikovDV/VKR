import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { AlarmIncident } from '../../src/models/AlarmIncident';

function buildIncidentInput() {
    return {
        edgeId: new Types.ObjectId(),
        sourceId: 'source-plc-1',
        deviceId: 'pump-1',
        metric: 'temperature',
        ruleId: 'temp-high',
        latestValue: 92.5,
        latestTs: 1_777_777_001,
        latestDetectedAt: 1_777_777_002,
        activatedAt: new Date('2026-05-08T06:00:00.000Z'),
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

describe('AlarmIncident model', () => {
    it('persists lifecycle, identity, observation, rule snapshot, and ACK fields without severity-as-state', () => {
        const incident = new AlarmIncident(buildIncidentInput());

        const error = incident.validateSync();
        expect(error).toBeUndefined();

        const plain = incident.toObject();
        expect(plain.edgeId).toBeInstanceOf(Types.ObjectId);
        expect(plain.sourceId).toBe('source-plc-1');
        expect(plain.deviceId).toBe('pump-1');
        expect(plain.metric).toBe('temperature');
        expect(plain.ruleId).toBe('temp-high');
        expect(plain.latestValue).toBe(92.5);
        expect(plain.latestTs).toBe(1_777_777_001);
        expect(plain.latestDetectedAt).toBe(1_777_777_002);
        expect(plain.isActive).toBe(true);
        expect(plain.isAcknowledged).toBe(false);
        expect(plain.clearedAt).toBeNull();
        expect(plain.acknowledgedAt).toBeNull();
        expect(plain.acknowledgedBy).toBeNull();
        expect(plain.rule).toMatchObject({
            ruleId: 'temp-high',
            ruleRevision: 'rev-2',
            conditionType: 'high',
            triggerThreshold: 90,
            clearThreshold: 85,
            expectedValue: null,
            severity: 'danger',
            label: 'Pump temperature high',
        });
        expect(plain).not.toHaveProperty('lifecycleState');
        expect(plain).not.toHaveProperty('severity');
    });

    it('rejects mismatched identity ruleId and snapshot ruleId', () => {
        const incident = new AlarmIncident({
            ...buildIncidentInput(),
            ruleId: 'different-rule',
        });

        const error = incident.validateSync();
        expect(error).toBeTruthy();
        expect(error?.errors['ruleId']).toBeTruthy();
    });

    it('defines reusable lookup, duplicate-active guard, future journal indexes, and no TTL index', () => {
        const indexes = AlarmIncident.schema.indexes();

        expect(indexes.some(([, options]) => 'expireAfterSeconds' in options)).toBe(false);

        expect(indexes).toContainEqual([
            {
                edgeId: 1,
                ruleId: 1,
                deviceId: 1,
                metric: 1,
                isActive: 1,
                isAcknowledged: 1,
                activatedAt: -1,
            },
            expect.objectContaining({ name: 'alarm_incident_reusable_lookup' }),
        ]);

        expect(indexes).toContainEqual([
            {
                edgeId: 1,
                ruleId: 1,
                deviceId: 1,
                metric: 1,
            },
            expect.objectContaining({
                name: 'alarm_incident_unique_active_identity',
                unique: true,
                partialFilterExpression: { isActive: true },
            }),
        ]);

        expect(indexes).toContainEqual([
            {
                edgeId: 1,
                activatedAt: -1,
                'rule.severity': 1,
                isActive: 1,
                isAcknowledged: 1,
            },
            expect.objectContaining({ name: 'alarm_incident_journal_filters' }),
        ]);
    });
});
