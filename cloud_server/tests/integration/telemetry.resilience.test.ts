/**
 * T033 — Telemetry DB Failover Integration Test (US4).
 *
 * Verifies the core resilience requirement:
 *   "DB bulk-write failures MUST NOT disrupt real-time telemetry
 *    broadcasts to dashboard clients."
 *
 * Strategy:
 *   1. Spy on TelemetryAggregatorService.drain() — the method that calls
 *      Telemetry.insertMany(). We mock Telemetry.insertMany to throw.
 *   2. Directly call TelemetryAggregatorService.ingest() to populate the
 *      aggregation window (simulates an edge push).
 *   3. Call drain() manually — it should catch the DB error internally and
 *      NOT re-throw.
 *   4. For the broadcast path: invoke registerTelemetryHandler directly with
 *      a mock io, prove that io.to().emit() is called even when insertMany
 *      is mocked to throw.
 *
 * Why no real Socket.IO server?
 *   Spinning up a full Socket.IO + MongoDB server in a unit-style integration
 *   test introduces unacceptable flakiness (port conflicts, timing issues).
 *   The broadcast path is COMPLETELY DECOUPLED from the DB path at the
 *   source-code level (see telemetry.ts T032). We test each path independently:
 *   - DB path: drain() swallows errors → verified via spy + mock
 *   - Broadcast path: io.to().emit() — verified via mock io instance
 *
 * This matches the spec requirement: "DB-ошибки не блокируют" (DB errors
 * must not block). The test confirms this at the call-graph level.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryAggregatorService } from '../../src/services/telemetry-aggregator.service';
import { Telemetry } from '../../src/models/Telemetry';
import { registerTelemetryHandler } from '../../src/socket/events/telemetry';
import type { Server as IOServer, Socket } from 'socket.io';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Minimal fake Socket.IO server that records emit calls. */
function makeMockIO() {
    const emitCalls: Array<{ room: string; event: string; payload: unknown }> = [];

    const mockIO = {
        to: (room: string) => ({
            emit: (event: string, payload: unknown) => {
                emitCalls.push({ room, event, payload });
            },
        }),
    } as unknown as IOServer;

    return { mockIO, emitCalls };
}

/** Minimal fake Socket that has event registration support. */
function makeMockSocket(edgeId: string): Socket {
    const handlers = new Map<string, (payload: unknown) => void>();
    return {
        connected: true,
        data: { edgeId, trustedEdgeSession: true },
        on: (event: string, handler: (payload: unknown) => void) => {
            handlers.set(event, handler);
        },
        // Helper to trigger a registered event (used in tests)
        _trigger: (event: string, payload: unknown) => {
            const h = handlers.get(event);
            if (h) h(payload);
        },
    } as unknown as Socket & { _trigger: (e: string, p: unknown) => void };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('T033 — Telemetry DB Failover (US4)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        TelemetryAggregatorService.resetForTests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ── T033-1: DB failure does not throw from drain() ────────────────────

    it('T033-1: drain() catches Telemetry.insertMany error — does not propagate', async () => {
        // Mock insertMany to simulate a DB failure
        vi.spyOn(Telemetry, 'insertMany').mockRejectedValueOnce(
            new Error('MongoNetworkError: connection timed out'),
        );

        // Populate the aggregation window with a dummy reading
        TelemetryAggregatorService.ingest('fakeedge001', [
            { deviceId: 'dev1', metric: 'temp', value: 42, ts: Date.now() },
        ]);

        expect(TelemetryAggregatorService.windowSize()).toBe(1);

        // drain() MUST NOT throw even though insertMany throws
        await expect(TelemetryAggregatorService.drain({ force: true })).resolves.toBeUndefined();

        // Window should have been cleared regardless of DB failure
        expect(TelemetryAggregatorService.windowSize()).toBe(0);

        // Confirm insertMany was actually called (not skipped)
        expect(Telemetry.insertMany).toHaveBeenCalledOnce();
    });

    // ── T033-2: Broadcast reaches dashboards despite DB failure ───────────

    it('T033-2: broadcast fires BEFORE ingest; io.to().emit() called even if insertMany mocked to throw', async () => {
        // Mock insertMany to throw for any subsequent drain call
        vi.spyOn(Telemetry, 'insertMany').mockRejectedValue(
            new Error('MongoServerError: write failed'),
        );

        const EDGE_ID = 'deadbeef00000000000cafef';
        const { mockIO, emitCalls } = makeMockIO();
        const mockSocket = makeMockSocket(EDGE_ID) as Socket & {
            _trigger: (e: string, p: unknown) => void;
        };

        // Register the telemetry handler (T032)
        registerTelemetryHandler(mockSocket, mockIO, EDGE_ID);

        const reading = {
            deviceId: 'device_A',
            metric: 'pressure',
            value: 3.14,
            ts: Date.now(),
        };

        // Simulate an edge telemetry batch arriving
        mockSocket._trigger('telemetry', { readings: [reading] });

        // ── ASSERT: two broadcasts on first batch ─────────────────────────
        // Variant A: first valid batch emits edge_status{online:true} THEN telemetry
        expect(emitCalls).toHaveLength(2);

        // First emit: edge_status — Online notification
        expect(emitCalls[0]?.room).toBe(EDGE_ID);
        expect(emitCalls[0]?.event).toBe('edge_status');
        expect((emitCalls[0]?.payload as { online: boolean }).online).toBe(true);

        // Second emit: telemetry broadcast
        expect(emitCalls[1]?.room).toBe(EDGE_ID);
        expect(emitCalls[1]?.event).toBe('telemetry');

        const broadcastPayload = emitCalls[1]?.payload as {
            edgeId: string;
            readings: Array<{ metric: string; last: number }>;
        };

        expect(broadcastPayload.edgeId).toBe(EDGE_ID);
        expect(broadcastPayload.readings).toHaveLength(1);
        expect(broadcastPayload.readings[0]?.metric).toBe('pressure');
        expect(broadcastPayload.readings[0]?.last).toBe(3.14);

        // ── ASSERT: drain does not throw despite DB failure ───────────────
        // Manually drain to trigger the (mocked) failed insertMany
        await expect(TelemetryAggregatorService.drain()).resolves.toBeUndefined();
    });

    // ── T033-3: Ingest does not require DB — pure in-memory ──────────────

    it('T033-3: ingest() is synchronous and has no DB dependency', () => {
        // Even if DB is completely unavailable, ingest() must be safe to call
        vi.spyOn(Telemetry, 'insertMany').mockRejectedValue(new Error('DB unavailable'));

        // Should not throw — no DB calls inside ingest()
        expect(() => {
            TelemetryAggregatorService.ingest('edgeXYZ', [
                { deviceId: 'd', metric: 'm', value: true, ts: Date.now() },
            ]);
        }).not.toThrow();

        // Window should contain 1 entry
        expect(TelemetryAggregatorService.windowSize()).toBeGreaterThan(0);
    });
});
