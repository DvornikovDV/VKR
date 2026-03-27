import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
    EDGE_ONBOARDING_AUDIT_ACTOR_TYPES,
    EDGE_ONBOARDING_AUDIT_EVENT_TYPES,
    EdgeOnboardingAudit,
} from '../../src/models/EdgeOnboardingAudit';

describe('EdgeOnboardingAudit model', () => {
    it('defines expected event/actor enums and immutable edgeId', () => {
        expect(EDGE_ONBOARDING_AUDIT_EVENT_TYPES).toContain('registered');
        expect(EDGE_ONBOARDING_AUDIT_EVENT_TYPES).toContain('reenabled');
        expect(EDGE_ONBOARDING_AUDIT_ACTOR_TYPES).toContain('admin');
        expect(EDGE_ONBOARDING_AUDIT_ACTOR_TYPES).toContain('system');

        const doc = new EdgeOnboardingAudit({
            edgeId: new Types.ObjectId(),
            type: 'onboarding_reset',
            actorType: 'admin',
            actorId: new Types.ObjectId().toString(),
            details: { reason: 'operator-reset' },
        });

        const plain = doc.toObject();
        expect(plain.type).toBe('onboarding_reset');
        expect(plain.actorType).toBe('admin');
        expect(plain.details).toMatchObject({ reason: 'operator-reset' });

        const edgeIdPath = EdgeOnboardingAudit.schema.path('edgeId');
        expect(edgeIdPath.options.immutable).toBe(true);
    });
});
