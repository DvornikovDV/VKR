import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findOneMock = vi.hoisted(() => vi.fn());
const findOneAndUpdateMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/models/AlarmIncident', () => ({
    AlarmIncident: {
        create: createMock,
        findOne: findOneMock,
        findOneAndUpdate: findOneAndUpdateMock,
    },
}));

import {
    acknowledgeAlarmIncident,
    findReusableAlarmIncident,
    persistActiveAlarmIncident,
    persistClearAlarmIncident,
    projectAlarmIncident,
} from '../../src/services/alarm-incidents.service';
import type { AlarmEventPayloadDto } from '../../src/types';

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

function buildAlarmEvent(overrides: Partial<AlarmEventPayloadDto> = {}): AlarmEventPayloadDto {
    return {
        edgeId: EDGE_ID.toHexString(),
        eventType: 'active',
        sourceId: 'source-plc-1',
        deviceId: 'pump-1',
        metric: 'temperature',
        value: 92.5,
        ts: 1_777_777_011,
        detectedAt: 1_777_777_012,
        rule: {
            ruleId: 'temp-high',
            ruleRevision: 'rev-3',
            conditionType: 'high',
            triggerThreshold: 90,
            clearThreshold: 85,
            expectedValue: null,
            severity: 'danger',
            label: 'Pump temperature high',
        },
        ...overrides,
    };
}

function queryResult(value: unknown) {
    return {
        exec: vi.fn().mockResolvedValue(value),
    };
}

describe('alarm incident service helpers', () => {
    beforeEach(() => {
        findOneMock.mockReset();
        findOneAndUpdateMock.mockReset();
        createMock.mockReset();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-08T06:10:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
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

    it('creates active incidents only when no reusable incident exists', async () => {
        const created = buildIncident({ activatedAt: new Date('2026-05-08T06:10:00.000Z') });
        findOneAndUpdateMock.mockReturnValueOnce(queryResult(null));
        createMock.mockResolvedValueOnce(created);

        await expect(persistActiveAlarmIncident(buildAlarmEvent())).resolves.toBe(created);

        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                edgeId: EDGE_ID,
                ruleId: 'temp-high',
                deviceId: 'pump-1',
                metric: 'temperature',
                $or: [{ isActive: true }, { isAcknowledged: false }],
            }),
            expect.any(Object),
            expect.objectContaining({ new: true, sort: { activatedAt: -1, createdAt: -1 } }),
        );
        expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
            edgeId: EDGE_ID,
            sourceId: 'source-plc-1',
            deviceId: 'pump-1',
            metric: 'temperature',
            ruleId: 'temp-high',
            latestValue: 92.5,
            latestTs: 1_777_777_011,
            latestDetectedAt: 1_777_777_012,
            isActive: true,
            isAcknowledged: false,
            activatedAt: new Date('2026-05-08T06:10:00.000Z'),
            clearedAt: null,
            acknowledgedAt: null,
            acknowledgedBy: null,
        }));
    });

    it('updates active acknowledged reusable incidents without ACK mutation or duplicate creation', async () => {
        const reusable = buildIncident({
            isActive: true,
            isAcknowledged: true,
            acknowledgedAt: new Date('2026-05-08T06:02:00.000Z'),
            acknowledgedBy: USER_ID,
        });
        findOneAndUpdateMock.mockReturnValueOnce(queryResult(reusable));

        await expect(persistActiveAlarmIncident(buildAlarmEvent())).resolves.toBe(reusable);

        const update = findOneAndUpdateMock.mock.calls[0][1];
        expect(update.$set).toMatchObject({
            sourceId: 'source-plc-1',
            latestValue: 92.5,
            latestTs: 1_777_777_011,
            latestDetectedAt: 1_777_777_012,
            isActive: true,
            clearedAt: null,
        });
        expect(update.$set).not.toHaveProperty('isAcknowledged');
        expect(update.$set).not.toHaveProperty('acknowledgedAt');
        expect(update.$set).not.toHaveProperty('acknowledgedBy');
        expect(createMock).not.toHaveBeenCalled();
    });

    it('reopens cleared unacknowledged reusable incidents without creating duplicates', async () => {
        const reusable = buildIncident({
            isActive: false,
            isAcknowledged: false,
            clearedAt: new Date('2026-05-08T06:05:00.000Z'),
        });
        findOneAndUpdateMock.mockReturnValueOnce(queryResult(reusable));

        await expect(persistActiveAlarmIncident(buildAlarmEvent())).resolves.toBe(reusable);

        const update = findOneAndUpdateMock.mock.calls[0][1];
        expect(update.$set).toMatchObject({
            sourceId: 'source-plc-1',
            latestValue: 92.5,
            latestTs: 1_777_777_011,
            latestDetectedAt: 1_777_777_012,
            isActive: true,
            clearedAt: null,
        });
        expect(update.$set).not.toHaveProperty('isAcknowledged');
        expect(update.$set).not.toHaveProperty('acknowledgedAt');
        expect(update.$set).not.toHaveProperty('acknowledgedBy');
        expect(createMock).not.toHaveBeenCalled();
    });

    it('recovers from duplicate active create races by returning the reusable incident', async () => {
        const racedIncident = buildIncident();
        const duplicateError = Object.assign(new Error('duplicate key'), { code: 11000 });
        findOneAndUpdateMock
            .mockReturnValueOnce(queryResult(null))
            .mockReturnValueOnce(queryResult(racedIncident));
        createMock.mockRejectedValueOnce(duplicateError);

        await expect(persistActiveAlarmIncident(buildAlarmEvent())).resolves.toBe(racedIncident);

        expect(createMock).toHaveBeenCalledTimes(1);
        expect(findOneAndUpdateMock).toHaveBeenCalledTimes(2);
    });

    it('clears reusable incidents by identity without ACK mutation or rule revision matching', async () => {
        const cleared = buildIncident({
            isActive: false,
            isAcknowledged: true,
            acknowledgedAt: new Date('2026-05-08T06:02:00.000Z'),
            acknowledgedBy: USER_ID,
            clearedAt: new Date('2026-05-08T06:10:00.000Z'),
        });
        findOneAndUpdateMock.mockReturnValueOnce(queryResult(cleared));

        await expect(persistClearAlarmIncident(buildAlarmEvent({
            eventType: 'clear',
            value: 84,
            rule: {
                ...buildAlarmEvent().rule,
                ruleRevision: 'rev-99',
            },
        }))).resolves.toBe(cleared);

        const [filter, update] = findOneAndUpdateMock.mock.calls[0];
        expect(filter).toMatchObject({
            edgeId: EDGE_ID,
            ruleId: 'temp-high',
            deviceId: 'pump-1',
            metric: 'temperature',
            $or: [{ isActive: true }, { isAcknowledged: false }],
        });
        expect(filter).not.toHaveProperty('rule.ruleRevision');
        expect(update.$set).toMatchObject({
            latestValue: 84,
            latestTs: 1_777_777_011,
            latestDetectedAt: 1_777_777_012,
            isActive: false,
            clearedAt: new Date('2026-05-08T06:10:00.000Z'),
        });
        expect(update.$set).not.toHaveProperty('isAcknowledged');
        expect(update.$set).not.toHaveProperty('acknowledgedAt');
        expect(update.$set).not.toHaveProperty('acknowledgedBy');
        expect(update.$set).not.toHaveProperty('rule');
    });

    it('ignores missing clear without creating an incident', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        findOneAndUpdateMock.mockReturnValueOnce(queryResult(null));

        await expect(persistClearAlarmIncident(buildAlarmEvent({ eventType: 'clear' }))).resolves.toBeNull();

        expect(createMock).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[alarm-incidents] Ignored clear'));
        warnSpy.mockRestore();
    });

    it('ACKs only owned incidents and mutates only ACK fields', async () => {
        const acknowledged = buildIncident({
            isActive: true,
            isAcknowledged: true,
            acknowledgedAt: new Date('2026-05-08T06:10:00.000Z'),
            acknowledgedBy: USER_ID,
        });
        findOneAndUpdateMock.mockReturnValueOnce(queryResult(acknowledged));

        await expect(acknowledgeAlarmIncident({
            edgeId: EDGE_ID.toHexString(),
            incidentId: '66336f9be7b3b3b9c6f10003',
            acknowledgedBy: USER_ID.toHexString(),
        })).resolves.toBe(acknowledged);

        const [filter, update] = findOneAndUpdateMock.mock.calls[0];
        expect(filter).toEqual({
            _id: new Types.ObjectId('66336f9be7b3b3b9c6f10003'),
            edgeId: EDGE_ID,
            isAcknowledged: false,
        });
        expect(update).toEqual({
            $set: {
                isAcknowledged: true,
                acknowledgedAt: new Date('2026-05-08T06:10:00.000Z'),
                acknowledgedBy: USER_ID,
            },
        });
    });

    it('returns already ACKed owned incidents without rewriting ACK fields', async () => {
        const alreadyAcknowledged = buildIncident({
            isAcknowledged: true,
            acknowledgedAt: new Date('2026-05-08T06:02:00.000Z'),
            acknowledgedBy: USER_ID,
        });
        findOneAndUpdateMock.mockReturnValueOnce(queryResult(null));
        findOneMock.mockReturnValueOnce(queryResult(alreadyAcknowledged));

        await expect(acknowledgeAlarmIncident({
            edgeId: EDGE_ID.toHexString(),
            incidentId: '66336f9be7b3b3b9c6f10003',
            acknowledgedBy: USER_ID.toHexString(),
        })).resolves.toBe(alreadyAcknowledged);

        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
            {
                _id: new Types.ObjectId('66336f9be7b3b3b9c6f10003'),
                edgeId: EDGE_ID,
                isAcknowledged: false,
            },
            expect.any(Object),
            expect.any(Object),
        );
        expect(findOneMock).toHaveBeenCalledWith({
            _id: new Types.ObjectId('66336f9be7b3b3b9c6f10003'),
            edgeId: EDGE_ID,
        });
    });

    it('returns null for ACK when incident ownership ids are invalid or unmatched', async () => {
        await expect(acknowledgeAlarmIncident({
            edgeId: 'not-an-id',
            incidentId: '66336f9be7b3b3b9c6f10003',
            acknowledgedBy: USER_ID.toHexString(),
        })).resolves.toBeNull();

        findOneAndUpdateMock.mockReturnValueOnce(queryResult(null));
        findOneMock.mockReturnValueOnce(queryResult(null));
        await expect(acknowledgeAlarmIncident({
            edgeId: EDGE_ID.toHexString(),
            incidentId: '66336f9be7b3b3b9c6f10003',
            acknowledgedBy: USER_ID.toHexString(),
        })).resolves.toBeNull();
    });
});
