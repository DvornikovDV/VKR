import assert from 'node:assert/strict';
import { EdgeServer } from '../../src/models/EdgeServer';

export async function run(): Promise<void> {
    const edge = new EdgeServer({
        name: 'Edge Repro T004',
        apiKeyHash: 'legacy-hash',
    });

    const plain = edge.toObject();

    assert.equal(plain.lifecycleState, 'Pending First Connection');
    assert.deepEqual(plain.availability, {
        online: false,
        lastSeenAt: null,
    });
    assert.deepEqual(plain.activation, {
        firstActivatedAt: null,
        lastActivatedAt: null,
        lastRejectedAt: null,
    });
    assert.equal(plain.currentOnboardingPackage, null);
    assert.equal(plain.persistentCredential, null);
    assert.equal(plain.lastLifecycleEventAt, null);
}
