import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const telemetryAggregateMock = vi.hoisted(() => vi.fn());
const edgeFindByIdMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/models/Telemetry', () => ({
    Telemetry: {
        aggregate: telemetryAggregateMock,
    },
}));

vi.mock('../../src/models/EdgeServer', () => ({
    EdgeServer: {
        findById: edgeFindByIdMock,
    },
}));

import {
    aggregateNumericTelemetryHistory,
    assertTrustedTelemetryHistoryAccess,
    buildNumericTelemetryHistoryPipeline,
    parseTelemetryHistoryQuery,
} from '../../src/services/telemetry-history.service';
import {
    TELEMETRY_HISTORY_DEFAULT_MAX_POINTS,
    TELEMETRY_HISTORY_MAX_POINTS,
} from '../../src/types';

const EDGE_ID = new Types.ObjectId('66336f9be7b3b3b9c6f10001');
const USER_ID = new Types.ObjectId('66336f9be7b3b3b9c6f10002');

function edgeLookupResult(value: unknown) {
    const exec = vi.fn().mockResolvedValue(value);
    const lean = vi.fn().mockReturnValue({ exec });
    const select = vi.fn().mockReturnValue({ lean });

    edgeFindByIdMock.mockReturnValueOnce({ select });

    return { select, lean, exec };
}

describe('telemetry history service primitives', () => {
    beforeEach(() => {
        telemetryAggregateMock.mockReset();
        edgeFindByIdMock.mockReset();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-13T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('parses bounded history query defaults and rejects ranges outside retention before aggregation input exists', () => {
        const parsed = parseTelemetryHistoryQuery({
            edgeId: EDGE_ID.toHexString(),
            deviceId: 'pump-1',
            metric: 'temperature.C/%',
            date_start: '2026-05-13T10:00:00.000Z',
            date_end: '2026-05-13T11:00:00.000Z',
        });

        expect(parsed).toEqual({
            edgeId: EDGE_ID.toHexString(),
            deviceId: 'pump-1',
            metric: 'temperature.C/%',
            dateStart: new Date('2026-05-13T10:00:00.000Z'),
            dateEnd: new Date('2026-05-13T11:00:00.000Z'),
            maxPoints: TELEMETRY_HISTORY_DEFAULT_MAX_POINTS,
        });

        expect(() => parseTelemetryHistoryQuery({
            edgeId: EDGE_ID.toHexString(),
            deviceId: 'pump-1',
            metric: 'temperature',
            date_start: '2026-05-05T11:59:59.999Z',
            date_end: '2026-05-13T11:00:00.000Z',
        })).toThrow('within the 7-day telemetry retention window');

        expect(() => parseTelemetryHistoryQuery({
            edgeId: EDGE_ID.toHexString(),
            deviceId: 'pump-1',
            metric: 'temperature',
            date_start: '2026-05-13T10:00:00.000Z',
            date_end: '2026-05-13T11:00:00.000Z',
            maxPoints: TELEMETRY_HISTORY_MAX_POINTS + 1,
        })).toThrow(`maximum is ${TELEMETRY_HISTORY_MAX_POINTS}`);

        expect(telemetryAggregateMock).not.toHaveBeenCalled();
    });

    it('validates trusted user access from EdgeServer assignments without active socket state', async () => {
        const trustedLookup = edgeLookupResult({ trustedUsers: [USER_ID] });

        await expect(assertTrustedTelemetryHistoryAccess({
            edgeId: EDGE_ID.toHexString(),
            userId: USER_ID.toHexString(),
        })).resolves.toBeUndefined();

        expect(trustedLookup.select).toHaveBeenCalledWith('trustedUsers');

        edgeLookupResult({ trustedUsers: [new Types.ObjectId('66336f9be7b3b3b9c6f10003')] });

        await expect(assertTrustedTelemetryHistoryAccess({
            edgeId: EDGE_ID.toHexString(),
            userId: USER_ID.toHexString(),
        })).rejects.toMatchObject({
            statusCode: 403,
        });
    });

    it('builds and executes numeric rollup aggregation with weighted average and latest timestamp last', async () => {
        const query = parseTelemetryHistoryQuery({
            edgeId: EDGE_ID.toHexString(),
            deviceId: 'pump-1',
            metric: 'temperature',
            date_start: '2026-05-13T10:00:00.000Z',
            date_end: '2026-05-13T11:00:00.000Z',
            maxPoints: '5',
        });
        const aggregateExec = vi.fn().mockResolvedValue([
            {
                timeStart: new Date('2026-05-13T10:00:00.000Z'),
                timeEnd: new Date('2026-05-13T10:00:01.000Z'),
                pointTime: new Date('2026-05-13T10:00:00.500Z'),
                min: 10,
                max: 30,
                avg: 22,
                last: 30,
                count: 5,
            },
        ]);

        telemetryAggregateMock.mockReturnValueOnce({ exec: aggregateExec });

        const pipeline = buildNumericTelemetryHistoryPipeline(query);
        expect(pipeline[0]).toEqual({
            $match: {
                'metadata.edgeId': EDGE_ID.toHexString(),
                'metadata.deviceId': 'pump-1',
                metric: 'temperature',
                'rollup.kind': 'numeric',
                timestamp: {
                    $gte: new Date('2026-05-13T10:00:00.000Z'),
                    $lt: new Date('2026-05-13T11:00:00.000Z'),
                },
            },
        });
        expect(pipeline[1]).toEqual({ $sort: { timestamp: 1 } });
        expect(JSON.stringify(pipeline)).toContain('"count":{"$sum":"$rollup.count"}');
        expect(JSON.stringify(pipeline)).toContain('"avg":{"$cond"');
        expect(JSON.stringify(pipeline)).toContain('"last":{"$last":"$rollup.last"}');

        const result = await aggregateNumericTelemetryHistory(query);

        expect(telemetryAggregateMock).toHaveBeenCalledWith(pipeline);
        expect(result).toEqual({
            edgeId: EDGE_ID.toHexString(),
            deviceId: 'pump-1',
            metric: 'temperature',
            dateStart: '2026-05-13T10:00:00.000Z',
            dateEnd: '2026-05-13T11:00:00.000Z',
            maxPoints: 5,
            series: [
                {
                    timeStart: '2026-05-13T10:00:00.000Z',
                    timeEnd: '2026-05-13T10:00:01.000Z',
                    pointTime: '2026-05-13T10:00:00.500Z',
                    min: 10,
                    max: 30,
                    avg: 22,
                    last: 30,
                    count: 5,
                },
            ],
        });
    });
});
