import { describe, expect, it } from 'vitest';
import {
    blockEdgeAggregate,
    registerEdgeAggregate,
    rotateEdgeCredentialAggregate,
    unblockEdgeAggregate,
} from '../../src/services/edge-lifecycle.domain';

describe('Edge lifecycle aggregate helpers', () => {
    it('registers a new edge as Active + offline with the first persistent credential', () => {
        const now = new Date('2026-04-12T00:00:00.000Z');

        const registered = registerEdgeAggregate({
            secretHash: 'initial-hash',
            now,
        });

        expect(registered.lifecycleState).toBe('Active');
        expect(registered.availability).toEqual({ online: false, lastSeenAt: null });
        expect(registered.persistentCredential).toEqual({
            version: 1,
            secretHash: 'initial-hash',
            issuedAt: now,
            lastAcceptedAt: null,
        });
        expect(registered.lastLifecycleEventAt).toBe(now);
    });

    it('keeps lifecycle Active during credential rotation and increments credential version', () => {
        const registeredAt = new Date('2026-04-12T00:00:00.000Z');
        const rotatedAt = new Date('2026-04-12T01:00:00.000Z');

        const registered = registerEdgeAggregate({
            secretHash: 'initial-hash',
            now: registeredAt,
        });
        const rotated = rotateEdgeCredentialAggregate(registered, {
            nextSecretHash: 'rotated-hash',
            now: rotatedAt,
        });

        expect(rotated.lifecycleState).toBe('Active');
        expect(rotated.persistentCredential).toEqual({
            version: 2,
            secretHash: 'rotated-hash',
            issuedAt: rotatedAt,
            lastAcceptedAt: null,
        });
        expect(rotated.lastLifecycleEventAt).toBe(rotatedAt);
    });

    it('blocks an edge without redefining availability and unblocks it with a fresh credential', () => {
        const registeredAt = new Date('2026-04-12T00:00:00.000Z');
        const blockedAt = new Date('2026-04-12T02:00:00.000Z');
        const unblockedAt = new Date('2026-04-12T03:00:00.000Z');

        const registered = registerEdgeAggregate({
            secretHash: 'initial-hash',
            now: registeredAt,
        });
        const blocked = blockEdgeAggregate(registered, { now: blockedAt });
        const unblocked = unblockEdgeAggregate(blocked, {
            nextSecretHash: 'unblocked-hash',
            now: unblockedAt,
        });

        expect(blocked.lifecycleState).toBe('Blocked');
        expect(blocked.availability).toEqual({ online: false, lastSeenAt: null });
        expect(blocked.lastLifecycleEventAt).toBe(blockedAt);

        expect(unblocked.lifecycleState).toBe('Active');
        expect(unblocked.availability).toEqual({ online: false, lastSeenAt: null });
        expect(unblocked.persistentCredential).toEqual({
            version: 2,
            secretHash: 'unblocked-hash',
            issuedAt: unblockedAt,
            lastAcceptedAt: null,
        });
        expect(unblocked.lastLifecycleEventAt).toBe(unblockedAt);
    });
});
