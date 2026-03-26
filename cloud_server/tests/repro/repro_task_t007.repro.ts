import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { EdgeOnboardingAudit } from '../../src/models/EdgeOnboardingAudit';
import { EdgeOnboardingAuditService } from '../../src/services/edge-onboarding-audit.service';

type OriginalCreate = typeof EdgeOnboardingAudit.create;
type OriginalFind = typeof EdgeOnboardingAudit.find;

export async function run(): Promise<void> {
    const createdPayloads: Array<Record<string, unknown>> = [];

    const originalCreate: OriginalCreate = EdgeOnboardingAudit.create.bind(EdgeOnboardingAudit);
    const originalFind: OriginalFind = EdgeOnboardingAudit.find.bind(EdgeOnboardingAudit);

    try {
        (EdgeOnboardingAudit.create as unknown as (payload: unknown) => Promise<unknown>) = async (
            payload: unknown,
        ) => {
            createdPayloads.push(payload as Record<string, unknown>);
            return payload;
        };

        (EdgeOnboardingAudit.find as unknown as (query: unknown) => unknown) = () => ({
            sort: () => ({
                limit: () => ({
                    lean: () => ({
                        exec: async () => [{ type: 'registered' }, { type: 'blocked' }],
                    }),
                }),
            }),
        });

        const edgeId = new Types.ObjectId().toString();
        const adminId = new Types.ObjectId().toString();

        await EdgeOnboardingAuditService.recordRegistered({ edgeId, adminId });
        await EdgeOnboardingAuditService.recordOnboardingReset({ edgeId, adminId });
        await EdgeOnboardingAuditService.recordActivationSucceeded({ edgeId });
        await EdgeOnboardingAuditService.recordTrustRevoked({ edgeId, adminId });
        await EdgeOnboardingAuditService.recordBlocked({ edgeId, adminId, reason: 'manual-block' });
        await EdgeOnboardingAuditService.recordReenabled({ edgeId, adminId });

        const events = await EdgeOnboardingAuditService.listByEdgeId(edgeId);
        assert.equal(events.length, 2);
        assert.equal((events[0] as { type: string }).type, 'registered');
        assert.equal((events[1] as { type: string }).type, 'blocked');

        assert.equal(createdPayloads.length, 6);
        const createdTypes = createdPayloads.map((entry) => entry['type']);
        assert.deepEqual(createdTypes, [
            'registered',
            'onboarding_reset',
            'activation_succeeded',
            'trust_revoked',
            'blocked',
            'reenabled',
        ]);
    } finally {
        EdgeOnboardingAudit.create = originalCreate;
        EdgeOnboardingAudit.find = originalFind;
    }
}
