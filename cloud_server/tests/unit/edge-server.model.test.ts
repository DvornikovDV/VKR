import { describe, expect, it } from 'vitest';
import { EdgeServer } from '../../src/models/EdgeServer';

describe('EdgeServer model defaults', () => {
    it('initializes lifecycle-aware defaults for a newly created edge document', () => {
        const edge = new EdgeServer({
            name: 'Edge Model Test',
            apiKeyHash: 'legacy-hash',
        });

        const plain = edge.toObject();

        expect(plain.lifecycleState).toBe('Pending First Connection');
        expect(plain.availability).toEqual({
            online: false,
            lastSeenAt: null,
        });
        expect(plain.activation).toEqual({
            firstActivatedAt: null,
            lastActivatedAt: null,
            lastRejectedAt: null,
        });
        expect(plain.currentOnboardingPackage).toBeNull();
        expect(plain.persistentCredential).toBeNull();
        expect(plain.lastLifecycleEventAt).toBeNull();
    });
});
