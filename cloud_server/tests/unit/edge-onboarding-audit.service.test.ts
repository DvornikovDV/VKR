import { afterEach, describe, expect, it, vi } from 'vitest';
import { EdgeOnboardingAudit } from '../../src/models/EdgeOnboardingAudit';
import { EdgeOnboardingAuditService } from '../../src/services/edge-onboarding-audit.service';

describe('EdgeOnboardingAuditService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('writes canonical audit events for registration/reset/activation/rejection/persistent issue/revoke/block/re-enable', async () => {
        const createSpy = vi
            .spyOn(EdgeOnboardingAudit, 'create')
            .mockResolvedValue({} as never);

        const edgeId = '507f191e810c19729de860ea';
        const adminId = '507f191e810c19729de860eb';

        await EdgeOnboardingAuditService.recordRegistered({ edgeId, adminId });
        await EdgeOnboardingAuditService.recordOnboardingReset({ edgeId, adminId });
        await EdgeOnboardingAuditService.recordActivationSucceeded({ edgeId });
        await EdgeOnboardingAuditService.recordActivationRejected({
            edgeId,
            details: { code: 'invalid_credential' },
        });
        await EdgeOnboardingAuditService.recordPersistentIssued({
            edgeId,
            version: 1,
            issuedAt: new Date('2026-03-26T00:00:00.000Z').toISOString(),
        });
        await EdgeOnboardingAuditService.recordTrustRevoked({ edgeId, adminId });
        await EdgeOnboardingAuditService.recordBlocked({ edgeId, adminId, reason: 'manual-block' });
        await EdgeOnboardingAuditService.recordReenabled({ edgeId, adminId });

        const createdTypes = createSpy.mock.calls.map((call) => call[0].type);
        expect(createdTypes).toEqual([
            'registered',
            'onboarding_reset',
            'activation_succeeded',
            'activation_rejected',
            'persistent_issued',
            'trust_revoked',
            'blocked',
            'reenabled',
        ]);
    });

    it('queries audit events by edgeId in reverse chronological order', async () => {
        const execMock = vi.fn().mockResolvedValue([
            {
                type: 'registered',
                actorType: 'admin',
                actorId: 'admin-id',
                occurredAt: new Date('2026-03-26T00:00:00.000Z'),
                details: {},
            },
            {
                type: 'blocked',
                actorType: 'admin',
                actorId: 'admin-id',
                occurredAt: new Date('2026-03-27T00:00:00.000Z'),
                details: { reason: 'manual-block' },
            },
        ]);

        const chain = {
            sort: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                    lean: vi.fn().mockReturnValue({
                        exec: execMock,
                    }),
                }),
            }),
        };

        vi.spyOn(EdgeOnboardingAudit, 'find').mockReturnValue(chain as never);

        const events = await EdgeOnboardingAuditService.listByEdgeId(
            '507f191e810c19729de860ea',
        );

        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({ type: 'registered' });
        expect(events[1]).toMatchObject({ type: 'blocked' });
    });
});
