import { describe, expect, it } from 'vitest';
import { EdgeServer } from '../../src/models/EdgeServer';

describe('EdgeServer lifecycle model', () => {
    it('defaults to Active lifecycle with separate offline availability and expected aggregate shape', () => {
        const edge = new EdgeServer({
            name: 'Edge Model Test',
        });

        const plain = edge.toObject();

        expect(plain.lifecycleState).toBe('Active');
        expect(plain.availability).toEqual({
            online: false,
            lastSeenAt: null,
        });
        expect(plain.persistentCredential).toBeNull();
        expect(plain.lastLifecycleEventAt).toBeNull();
    });

    it('rejects non-canonical lifecycle values and keeps only current persistent credential metadata', () => {
        const invalidLifecycleEdge = new EdgeServer({
            name: 'Invalid Lifecycle Edge',
            lifecycleState: 'InvalidState',
        });

        const invalidError = invalidLifecycleEdge.validateSync();
        expect(invalidError).toBeTruthy();
        expect(invalidError?.errors['lifecycleState']).toBeTruthy();

        const edge = new EdgeServer({
            name: 'Persistent Credential Edge',
            lifecycleState: 'Active',
            persistentCredential: {
                version: 3,
                secretHash: 'credential-hash',
                issuedAt: new Date('2026-04-12T00:00:00.000Z'),
                lastAcceptedAt: null,
                revokedAt: new Date('2026-04-12T01:00:00.000Z'),
                revocationReason: 'rotate',
            },
        });

        const plain = edge.toObject() as {
            persistentCredential?: Record<string, unknown>;
        };

        expect(plain.persistentCredential).toMatchObject({
            version: 3,
            secretHash: 'credential-hash',
            lastAcceptedAt: null,
        });
        expect(plain.persistentCredential).not.toHaveProperty('revokedAt');
        expect(plain.persistentCredential).not.toHaveProperty('revocationReason');
    });
});
