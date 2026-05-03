import { afterEach, describe, expect, it } from 'vitest';

import {
    cleanupPendingCommand,
    getPendingCommandCount,
    registerPendingCommand,
    resetPendingCommandRegistryForTests,
    resolvePendingCommandResult,
} from '../../src/services/command-pending-registry';

describe('command pending registry', () => {
    afterEach(() => {
        resetPendingCommandRegistryForTests();
    });

    it('cleans up on result-first resolution and ignores duplicate results', async () => {
        const pending = registerPendingCommand({
            edgeId: 'edge-result-first',
            requestId: 'request-result-first',
            timeoutMs: 500,
        });

        expect(getPendingCommandCount()).toBe(1);

        const resolved = resolvePendingCommandResult('edge-result-first', {
            requestId: 'request-result-first',
            status: 'confirmed',
            completedAt: '2026-05-03T00:00:00.000Z',
        });

        expect(resolved).toBe('resolved');
        await expect(pending.promise).resolves.toEqual({
            kind: 'result',
            result: {
                requestId: 'request-result-first',
                status: 'confirmed',
                completedAt: '2026-05-03T00:00:00.000Z',
            },
        });
        expect(getPendingCommandCount()).toBe(0);

        expect(resolvePendingCommandResult('edge-result-first', {
            requestId: 'request-result-first',
            status: 'failed',
            failureReason: 'edge_command_failed',
            completedAt: '2026-05-03T00:00:01.000Z',
        })).toBe('ignored_unknown_request');
    });

    it('cleans up on timeout-first resolution and ignores late results', async () => {
        const pending = registerPendingCommand({
            edgeId: 'edge-timeout-first',
            requestId: 'request-timeout-first',
            timeoutMs: 10,
        });

        await expect(pending.promise).resolves.toEqual({
            kind: 'timeout',
            edgeId: 'edge-timeout-first',
            requestId: 'request-timeout-first',
            completedAt: expect.any(String),
        });
        expect(getPendingCommandCount()).toBe(0);

        expect(resolvePendingCommandResult('edge-timeout-first', {
            requestId: 'request-timeout-first',
            status: 'confirmed',
            completedAt: '2026-05-03T00:00:02.000Z',
        })).toBe('ignored_unknown_request');
    });

    it('keeps pending entries for mismatched edge results until explicit cleanup', () => {
        registerPendingCommand({
            edgeId: 'edge-owner',
            requestId: 'request-edge-mismatch',
            timeoutMs: 500,
        });

        expect(resolvePendingCommandResult('edge-other', {
            requestId: 'request-edge-mismatch',
            status: 'confirmed',
            completedAt: '2026-05-03T00:00:03.000Z',
        })).toBe('ignored_edge_mismatch');
        expect(getPendingCommandCount()).toBe(1);

        expect(cleanupPendingCommand('request-edge-mismatch')).toBe(true);
        expect(getPendingCommandCount()).toBe(0);
    });
});
