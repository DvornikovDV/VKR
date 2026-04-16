import { describe, expect, it } from 'vitest';
import {
    blockEdgeAggregate,
    hashPersistentCredentialSecret,
    registerEdgeAggregate,
    rotateEdgeCredentialAggregate,
    unblockEdgeAggregate,
    verifyPersistentCredentialSecret,
} from '../../src/services/edge-lifecycle.domain';

describe('edge-lifecycle.domain', () => {
    it('registers edge as Active + offline with initial persistent credential', () => {
        const now = new Date('2026-04-14T00:00:00.000Z');
        const aggregate = registerEdgeAggregate({
            secretHash: 'hash-v1',
            now,
        });

        expect(aggregate).toEqual({
            lifecycleState: 'Active',
            availability: {
                online: false,
                lastSeenAt: null,
            },
            persistentCredential: {
                version: 1,
                secretHash: 'hash-v1',
                issuedAt: now,
                lastAcceptedAt: null,
            },
            lastLifecycleEventAt: now,
        });
    });

    it('keeps lifecycle Active on rotate and increments credential version', () => {
        const initial = registerEdgeAggregate({
            secretHash: 'hash-v1',
            now: new Date('2026-04-14T00:00:00.000Z'),
        });
        const rotatedAt = new Date('2026-04-14T01:00:00.000Z');

        const rotated = rotateEdgeCredentialAggregate(initial, {
            nextSecretHash: 'hash-v2',
            now: rotatedAt,
        });

        expect(rotated.lifecycleState).toBe('Active');
        expect(rotated.persistentCredential?.version).toBe(2);
        expect(rotated.persistentCredential?.secretHash).toBe('hash-v2');
        expect(rotated.lastLifecycleEventAt?.toISOString()).toBe(rotatedAt.toISOString());
    });

    it('blocks edge without changing credential and unblocks with fresh credential', () => {
        const initial = registerEdgeAggregate({
            secretHash: 'hash-v1',
            now: new Date('2026-04-14T00:00:00.000Z'),
        });

        const blocked = blockEdgeAggregate(initial, {
            now: new Date('2026-04-14T01:00:00.000Z'),
        });

        expect(blocked.lifecycleState).toBe('Blocked');
        expect(blocked.availability.online).toBe(false);
        expect(blocked.persistentCredential?.version).toBe(1);

        const unblocked = unblockEdgeAggregate(blocked, {
            nextSecretHash: 'hash-v2',
            now: new Date('2026-04-14T02:00:00.000Z'),
        });

        expect(unblocked.lifecycleState).toBe('Active');
        expect(unblocked.availability.online).toBe(false);
        expect(unblocked.persistentCredential?.version).toBe(2);
        expect(unblocked.persistentCredential?.secretHash).toBe('hash-v2');
    });

    it('hashes and verifies persistent credential secrets', async () => {
        const plain = 'persistent-secret-for-test';
        const hash = await hashPersistentCredentialSecret(plain);

        await expect(verifyPersistentCredentialSecret(plain, hash)).resolves.toBe(true);
        await expect(verifyPersistentCredentialSecret('wrong-secret', hash)).resolves.toBe(false);
    });
});
