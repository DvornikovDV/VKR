import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Telemetry, type ITelemetryDoc } from '../../src/models/Telemetry';
import { TelemetryAggregatorService } from '../../src/services/telemetry-aggregator.service';

function docsFromCall(spy: ReturnType<typeof vi.spyOn>, callIndex: number): ITelemetryDoc[] {
    return (spy.mock.calls[callIndex]?.[0] ?? []) as ITelemetryDoc[];
}

describe('TelemetryAggregatorService event-time history rollups', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        TelemetryAggregatorService.resetForTests();
    });

    it('buckets numeric readings by reading.ts and persists 1-second rollups', async () => {
        const insertSpy = vi.spyOn(Telemetry, 'insertMany').mockResolvedValue([] as never);
        const baseTs = 1_710_000_000_123;

        TelemetryAggregatorService.ingest('edge-a', [
            { deviceId: 'pump-1', metric: 'temperature', value: 10, ts: baseTs },
            { deviceId: 'pump-1', metric: 'temperature', value: 15, ts: baseTs + 700 },
            { deviceId: 'pump-1', metric: 'temperature', value: 7, ts: baseTs + 1_200 },
        ], baseTs + 1_500);

        await TelemetryAggregatorService.drain({ force: true, nowMs: baseTs + 4_000 });

        expect(insertSpy).toHaveBeenCalledTimes(1);
        const docs = docsFromCall(insertSpy, 0);
        expect(docs).toHaveLength(2);

        const firstBucketStart = Math.floor(baseTs / 1_000) * 1_000;
        const secondBucketStart = firstBucketStart + 1_000;

        const firstDoc = docs.find((doc) => doc.timestamp.getTime() === firstBucketStart);
        const secondDoc = docs.find((doc) => doc.timestamp.getTime() === secondBucketStart);

        expect(firstDoc).toBeDefined();
        expect(firstDoc?.rollup.kind).toBe('numeric');
        if (firstDoc?.rollup.kind === 'numeric') {
            expect(firstDoc.rollup.min).toBe(10);
            expect(firstDoc.rollup.max).toBe(15);
            expect(firstDoc.rollup.sum).toBe(25);
            expect(firstDoc.rollup.count).toBe(2);
            expect(firstDoc.rollup.avg).toBeCloseTo(12.5, 5);
            expect(firstDoc.rollup.last).toBe(15);
        }

        expect(secondDoc).toBeDefined();
        expect(secondDoc?.rollup.kind).toBe('numeric');
        if (secondDoc?.rollup.kind === 'numeric') {
            expect(secondDoc.rollup.min).toBe(7);
            expect(secondDoc.rollup.max).toBe(7);
            expect(secondDoc.rollup.sum).toBe(7);
            expect(secondDoc.rollup.count).toBe(1);
            expect(secondDoc.rollup.avg).toBe(7);
            expect(secondDoc.rollup.last).toBe(7);
        }
    });

    it('persists boolean rollups with true/false counters and last value', async () => {
        const insertSpy = vi.spyOn(Telemetry, 'insertMany').mockResolvedValue([] as never);
        const ts = 1_710_100_000_000;

        TelemetryAggregatorService.ingest('edge-b', [
            { deviceId: 'valve-2', metric: 'state', value: true, ts },
            { deviceId: 'valve-2', metric: 'state', value: false, ts: ts + 100 },
            { deviceId: 'valve-2', metric: 'state', value: true, ts: ts + 200 },
        ], ts + 300);

        await TelemetryAggregatorService.drain({ force: true, nowMs: ts + 2_000 });

        expect(insertSpy).toHaveBeenCalledTimes(1);
        const docs = docsFromCall(insertSpy, 0);
        expect(docs).toHaveLength(1);
        expect(docs[0]?.rollup.kind).toBe('boolean');

        if (docs[0]?.rollup.kind === 'boolean') {
            expect(docs[0].rollup.trueCount).toBe(2);
            expect(docs[0].rollup.falseCount).toBe(1);
            expect(docs[0].rollup.count).toBe(3);
            expect(docs[0].rollup.last).toBe(true);
        }
    });

    it('handles slightly late packets deterministically and drops packets for sealed buckets', async () => {
        const insertSpy = vi.spyOn(Telemetry, 'insertMany').mockResolvedValue([] as never);

        TelemetryAggregatorService.ingest('edge-c', [
            { deviceId: 'pump-3', metric: 'pressure', value: 10, ts: 9_100 },
            { deviceId: 'pump-3', metric: 'pressure', value: 20, ts: 10_100 },
        ], 11_000);

        await TelemetryAggregatorService.drain({ nowMs: 12_500 });
        expect(insertSpy).toHaveBeenCalledTimes(1);
        const firstDrainDocs = docsFromCall(insertSpy, 0);
        expect(firstDrainDocs).toHaveLength(1);
        expect(firstDrainDocs[0]?.timestamp.getTime()).toBe(9_000);

        TelemetryAggregatorService.ingest('edge-c', [
            // Too-late packet for an already flushed bucket (9000-9999) -> dropped.
            { deviceId: 'pump-3', metric: 'pressure', value: 999, ts: 9_500 },
            // Slightly late packet for still-open bucket (10000-10999) -> included.
            { deviceId: 'pump-3', metric: 'pressure', value: 25, ts: 10_050 },
        ], 12_600);

        await TelemetryAggregatorService.drain({ force: true, nowMs: 13_000 });
        expect(insertSpy).toHaveBeenCalledTimes(2);
        const secondDrainDocs = docsFromCall(insertSpy, 1);
        expect(secondDrainDocs).toHaveLength(1);
        expect(secondDrainDocs[0]?.timestamp.getTime()).toBe(10_000);
        expect(secondDrainDocs[0]?.rollup.kind).toBe('numeric');

        if (secondDrainDocs[0]?.rollup.kind === 'numeric') {
            expect(secondDrainDocs[0].rollup.count).toBe(2);
            expect(secondDrainDocs[0].rollup.min).toBe(20);
            expect(secondDrainDocs[0].rollup.max).toBe(25);
            expect(secondDrainDocs[0].rollup.sum).toBe(45);
            expect(secondDrainDocs[0].rollup.avg).toBeCloseTo(22.5, 5);
            // Last is chosen by edge event time (ts), not by arrival order.
            expect(secondDrainDocs[0].rollup.last).toBe(20);
        }
    });

    it('keeps distinct metric streams for one device when metric contains allowed delimiter characters', async () => {
        const insertSpy = vi.spyOn(Telemetry, 'insertMany').mockResolvedValue([] as never);
        const ts = 1_711_000_000_100;

        TelemetryAggregatorService.ingest('edge-delimiter', [
            { deviceId: 'pump-1', metric: 'temperature:inlet', value: 1, ts },
            { deviceId: 'pump-1', metric: 'temperature/inlet', value: 2, ts },
        ], ts + 50);

        await TelemetryAggregatorService.drain({ force: true, nowMs: ts + 2_000 });
        const docs = docsFromCall(insertSpy, 0);
        expect(docs).toHaveLength(2);

        expect(docs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    metadata: expect.objectContaining({ deviceId: 'pump-1' }),
                    metric: 'temperature:inlet',
                }),
                expect.objectContaining({
                    metadata: expect.objectContaining({ deviceId: 'pump-1' }),
                    metric: 'temperature/inlet',
                }),
            ]),
        );
    });

    it('normalizes valid identity fields and drops malformed deviceId/metric values', async () => {
        const insertSpy = vi.spyOn(Telemetry, 'insertMany').mockResolvedValue([] as never);
        const ts = 1_712_000_000_000;

        TelemetryAggregatorService.ingest('edge-identity', [
            { deviceId: ' pump-1 ', metric: ' temp.C/% ', value: 10, ts },
            { deviceId: 'pump/2', metric: 'pressure', value: 20, ts }, // invalid deviceId
            { deviceId: 'pump-3', metric: 'temp value', value: 30, ts }, // invalid metric
        ], ts + 100);

        await TelemetryAggregatorService.drain({ force: true, nowMs: ts + 2_000 });
        const docs = docsFromCall(insertSpy, 0);
        expect(docs).toHaveLength(1);
        expect(docs[0]).toEqual(
            expect.objectContaining({
                metadata: expect.objectContaining({ deviceId: 'pump-1' }),
                metric: 'temp.C/%',
            }),
        );
    });
});
