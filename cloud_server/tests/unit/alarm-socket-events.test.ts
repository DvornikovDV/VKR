import { describe, expect, it, vi } from 'vitest';

import { emitAlarmIncidentChanged } from '../../src/socket/events/alarm';
import { ALARM_INCIDENT_CHANGED_EVENT_NAME, type AlarmIncidentProjectionDto } from '../../src/types';

const incident: AlarmIncidentProjectionDto = {
    incidentId: '66336f9be7b3b3b9c6f10003',
    edgeId: '66336f9be7b3b3b9c6f10001',
    sourceId: 'source-plc-1',
    deviceId: 'pump-1',
    metric: 'temperature',
    ruleId: 'temp-high',
    lifecycleState: 'active_unacknowledged',
    isActive: true,
    isAcknowledged: false,
    activatedAt: '2026-05-08T06:00:00.000Z',
    clearedAt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    latestValue: 92.5,
    latestTs: 1_777_777_001,
    latestDetectedAt: 1_777_777_002,
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
    createdAt: '2026-05-08T06:00:01.000Z',
    updatedAt: '2026-05-08T06:00:02.000Z',
};

describe('alarm socket events', () => {
    it('broadcasts incident changes only to the edgeId room', () => {
        const emit = vi.fn();
        const to = vi.fn().mockReturnValue({ emit });
        const io = { to };

        emitAlarmIncidentChanged(io as never, incident.edgeId, incident);

        expect(to).toHaveBeenCalledOnce();
        expect(to).toHaveBeenCalledWith(incident.edgeId);
        expect(emit).toHaveBeenCalledWith(ALARM_INCIDENT_CHANGED_EVENT_NAME, {
            edgeId: incident.edgeId,
            incident,
        });
    });
});
