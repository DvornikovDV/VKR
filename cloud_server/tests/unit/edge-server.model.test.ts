import { describe, expect, it } from 'vitest';
import { EdgeServer } from '../../src/models/EdgeServer';

describe('EdgeServer lifecycle model', () => {
    it('defaults to Active lifecycle with separate offline availability and no legacy onboarding fields', () => {
        const edge = new EdgeServer({
            name: 'Edge Model Test',
        });

        const plain = edge.toObject();

        expect(plain.lifecycleState).toBe('Active');
        expect(plain.availability).toEqual({
            online: false,
            lastSeenAt: null,
        });
        expect(plain).not.toHaveProperty('activation');
        expect(plain).not.toHaveProperty('currentOnboardingPackage');
        expect(plain.lastLifecycleEventAt).toBeNull();
    });

    it('rejects legacy onboarding lifecycle values and keeps only current persistent credential metadata', () => {
        const legacyLifecycleEdge = new EdgeServer({
            name: 'Legacy Lifecycle Edge',
            lifecycleState: 'Pending First Connection',
        });

        const legacyError = legacyLifecycleEdge.validateSync();
        expect(legacyError).toBeTruthy();
        expect(legacyError?.errors['lifecycleState']).toBeTruthy();

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
