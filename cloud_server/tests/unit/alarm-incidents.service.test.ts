import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findOneMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/models/AlarmIncident', () => ({
    AlarmIncident: {
        findOne: findOneMock,
    },
}));

import {
    findReusableAlarmIncident,
    projectAlarmIncident,
} from '../../src/services/alarm-incidents.service';

const EDGE_ID = new Types.ObjectId('66336f9be7b3b3b9c6f10001');
const USER_ID = new Types.ObjectId('66336f9be7b3b3b9c6f10002');

function buildIncident(overrides: Record<string, unknown> = {}) {
    return {
        _id: new Types.ObjectId('66336f9be7b3b3b9c6f10003'),
        edgeId: EDGE_ID,
        sourceId: 'source-plc-1',
        deviceId: 'pump-1',
        metric: 'temperature',
        ruleId: 'temp-high',
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
        isActive: true,
        isAcknowledged: false,
        activatedAt: new Date('2026-05-08T06:00:00.000Z'),
        clearedAt: null,
        acknowledgedAt: null,
        acknowledgedBy: null,
        createdAt: new Date('2026-05-08T06:00:01.000Z'),
        updatedAt: new Date('2026-05-08T06:00:02.000Z'),
        ...overrides,
    };
}

describe('alarm incident service helpers', () => {
    beforeEach(() => {
        findOneMock.mockReset();
    });

    it('projects incident lifecycle, identity, observation, and rule snapshot without document internals', () => {
        const projection = projectAlarmIncident(buildIncident({
            isActive: false,
            isAcknowledged: true,
            clearedAt: new Date('2026-05-08T06:05:00.000Z'),
            acknowledgedAt: new Date('2026-05-08T06:06:00.000Z'),
            acknowledgedBy: USER_ID,
        }) as never);

        expect(projection).toEqual({
            incidentId: '66336f9be7b3b3b9c6f10003',
            edgeId: EDGE_ID.toHexString(),
            sourceId: 'source-plc-1',
            deviceId: 'pump-1',
            metric: 'temperature',
            ruleId: 'temp-high',
            lifecycleState: 'closed',
            isActive: false,
            isAcknowledged: true,
            activatedAt: '2026-05-08T06:00:00.000Z',
            clearedAt: '2026-05-08T06:05:00.000Z',
            acknowledgedAt: '2026-05-08T06:06:00.000Z',
            acknowledgedBy: USER_ID.toHexString(),
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
        });
        expect(projection).not.toHaveProperty('_id');
        expect(projection).not.toHaveProperty('$__');
    });

    it('looks up the latest not-fully-closed incident by reusable identity', async () => {
        const incident = buildIncident();
        const execMock = vi.fn().mockResolvedValue(incident);
        const sortMock = vi.fn().mockReturnValue({ exec: execMock });
        findOneMock.mockReturnValue({ sort: sortMock });

        await expect(findReusableAlarmIncident({
            edgeId: EDGE_ID.toHexString(),
            ruleId: 'temp-high',
            deviceId: 'pump-1',
            metric: 'temperature',
        })).resolves.toBe(incident);

        expect(findOneMock).toHaveBeenCalledWith({
            edgeId: EDGE_ID,
            ruleId: 'temp-high',
            deviceId: 'pump-1',
            metric: 'temperature',
            $or: [{ isActive: true }, { isAcknowledged: false }],
        });
        expect(sortMock).toHaveBeenCalledWith({ activatedAt: -1, createdAt: -1 });
    });
});
