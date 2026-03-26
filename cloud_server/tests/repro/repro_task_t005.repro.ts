import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
    EdgeOnboardingAudit,
    EDGE_ONBOARDING_AUDIT_ACTOR_TYPES,
    EDGE_ONBOARDING_AUDIT_EVENT_TYPES,
} from '../../src/models/EdgeOnboardingAudit';

export async function run(): Promise<void> {
    assert.ok(EDGE_ONBOARDING_AUDIT_EVENT_TYPES.includes('registered'));
    assert.ok(EDGE_ONBOARDING_AUDIT_EVENT_TYPES.includes('reenabled'));
    assert.ok(EDGE_ONBOARDING_AUDIT_ACTOR_TYPES.includes('admin'));
    assert.ok(EDGE_ONBOARDING_AUDIT_ACTOR_TYPES.includes('system'));

    const doc = new EdgeOnboardingAudit({
        edgeId: new Types.ObjectId(),
        type: 'onboarding_reset',
        actorType: 'admin',
        actorId: new Types.ObjectId().toString(),
        details: { reason: 'operator-reset' },
    });

    const plain = doc.toObject();
    assert.equal(plain.type, 'onboarding_reset');
    assert.equal(plain.actorType, 'admin');
    assert.equal(plain.details.reason, 'operator-reset');

    const edgeIdPath = EdgeOnboardingAudit.schema.path('edgeId');
    assert.equal(edgeIdPath.options.immutable, true);
}
