import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_ONBOARDING_PACKAGE_TTL_MS,
    applyLifecycleTransition,
    createOnboardingPackageMetadata,
    createPersistentCredentialMetadata,
    generateCredentialSecret,
    hashCredentialSecret,
    isOnboardingPackageExpired,
    resolveOnboardingPackageStatus,
    rotatePersistentCredentialMetadata,
    verifyCredentialSecret,
} from '../../src/services/edge-onboarding.service';
import {
    mapEdgeToAdminProjection,
    mapEdgeToTelemetryReadyProjection,
} from '../../src/services/edge-servers.service';

describe('edge-onboarding.service', () => {
    it('generates secrets and validates hashed credentials', async () => {
        const firstSecret = generateCredentialSecret();
        const secondSecret = generateCredentialSecret();

        expect(firstSecret.length).toBeGreaterThan(20);
        expect(firstSecret).not.toBe(secondSecret);

        const hash = await hashCredentialSecret(firstSecret);
        await expect(verifyCredentialSecret(firstSecret, hash)).resolves.toBe(true);
        await expect(verifyCredentialSecret('invalid-secret', hash)).resolves.toBe(false);
    });

    it('builds onboarding package metadata with TTL and ready state', () => {
        const issuedAt = new Date('2026-03-26T00:00:00.000Z');
        const metadata = createOnboardingPackageMetadata({
            issuedBy: new Types.ObjectId(),
            secretHash: 'hash-value',
            issuedAt,
        });

        expect(metadata.status).toBe('ready');
        expect(metadata.issuedAt.toISOString()).toBe(issuedAt.toISOString());
        expect(metadata.expiresAt.getTime() - metadata.issuedAt.getTime()).toBe(
            DEFAULT_ONBOARDING_PACKAGE_TTL_MS,
        );
    });

    it('builds persistent credential metadata and increments version', () => {
        const metadata = createPersistentCredentialMetadata({
            secretHash: 'hash-value',
            previousVersion: 2,
            issuedAt: new Date('2026-03-26T00:00:00.000Z'),
        });

        expect(metadata.version).toBe(3);
        expect(metadata.revokedAt).toBeNull();
        expect(metadata.revocationReason).toBeNull();
    });

    it('evaluates onboarding package expiry only for ready packages', () => {
        const now = new Date('2026-03-26T03:00:00.000Z');
        const expiredReady = createOnboardingPackageMetadata({
            issuedBy: null,
            secretHash: 'hash-ready-expired',
            issuedAt: new Date('2026-03-26T01:00:00.000Z'),
            expiresAt: new Date('2026-03-26T02:00:00.000Z'),
        });

        expect(isOnboardingPackageExpired(expiredReady, now)).toBe(true);
        expect(resolveOnboardingPackageStatus(expiredReady, now)).toBe('expired');

        const usedPackage = {
            ...expiredReady,
            status: 'used' as const,
            usedAt: new Date('2026-03-26T01:30:00.000Z'),
        };

        expect(isOnboardingPackageExpired(usedPackage, now)).toBe(false);
        expect(resolveOnboardingPackageStatus(usedPackage, now)).toBe('used');
    });

    it('rotates persistent credential metadata and increments version from current credential', () => {
        const current = createPersistentCredentialMetadata({
            secretHash: 'current-hash',
            previousVersion: 2,
            issuedAt: new Date('2026-03-26T00:00:00.000Z'),
        });

        const rotated = rotatePersistentCredentialMetadata({
            nextSecretHash: 'next-hash',
            previousCredential: current,
            issuedAt: new Date('2026-03-26T01:00:00.000Z'),
        });

        expect(rotated.version).toBe(4);
        expect(rotated.secretHash).toBe('next-hash');
        expect(rotated.issuedAt.toISOString()).toBe('2026-03-26T01:00:00.000Z');
        expect(rotated.lastAcceptedAt).toBeNull();
        expect(rotated.revokedAt).toBeNull();
        expect(rotated.revocationReason).toBeNull();
    });

    it('applies lifecycle transitions and exposes lifecycle-aware projections', () => {
        const now = new Date('2026-03-26T00:00:00.000Z');

        const transitioned = applyLifecycleTransition({
            lifecycleState: 'Pending First Connection',
            reason: 'activation_succeeded',
            at: now,
        });

        expect(transitioned.lifecycleState).toBe('Active');
        expect(transitioned.activation.firstActivatedAt?.toISOString()).toBe(now.toISOString());
        expect(transitioned.activation.lastActivatedAt?.toISOString()).toBe(now.toISOString());

        const adminProjection = mapEdgeToAdminProjection({
            _id: new Types.ObjectId(),
            name: 'Edge Unit',
            lifecycleState: 'Active',
            availability: { online: true, lastSeenAt: now },
            trustedUsers: [],
            createdBy: null,
            currentOnboardingPackage: createOnboardingPackageMetadata({
                issuedBy: null,
                secretHash: 'hidden-hash',
                issuedAt: now,
            }),
            persistentCredential: createPersistentCredentialMetadata({
                secretHash: 'persistent-hash',
                previousVersion: 0,
                issuedAt: now,
            }),
            lastLifecycleEventAt: now,
        });

        expect(adminProjection.isTelemetryReady).toBe(true);
        expect(adminProjection.persistentCredentialVersion).toBe(1);
        expect('secretHash' in (adminProjection.currentOnboardingPackage ?? {})).toBe(false);

        const telemetryProjection = mapEdgeToTelemetryReadyProjection({
            _id: new Types.ObjectId(),
            name: 'Edge Unit',
            lifecycleState: 'Active',
            availability: { online: true, lastSeenAt: now },
            persistentCredential: createPersistentCredentialMetadata({
                secretHash: 'persistent-hash',
                previousVersion: 0,
                issuedAt: now,
            }),
        });

        expect(telemetryProjection?.lifecycleState).toBe('Active');
    });

    it('T012-3 keeps lifecycle state stable on activation rejection while recording rejection timestamp', () => {
        const now = new Date('2026-04-06T10:00:00.000Z');
        const rejection = applyLifecycleTransition({
            lifecycleState: 'Active',
            reason: 'activation_rejected',
            at: now,
            activation: {
                firstActivatedAt: new Date('2026-04-05T00:00:00.000Z'),
                lastActivatedAt: new Date('2026-04-06T09:00:00.000Z'),
                lastRejectedAt: null,
            },
        });

        expect(rejection.lifecycleState).toBe('Active');
        expect(rejection.activation.firstActivatedAt?.toISOString()).toBe('2026-04-05T00:00:00.000Z');
        expect(rejection.activation.lastActivatedAt?.toISOString()).toBe('2026-04-06T09:00:00.000Z');
        expect(rejection.activation.lastRejectedAt?.toISOString()).toBe(now.toISOString());
    });

    it('T012b-1 keeps trust-loss and rejected reconnect outside any telemetry-ready future path', () => {
        const revokedAt = new Date('2026-04-07T09:00:00.000Z');
        const afterTrustRevoked = applyLifecycleTransition({
            lifecycleState: 'Active',
            reason: 'trust_revoked',
            at: revokedAt,
            activation: {
                firstActivatedAt: new Date('2026-04-06T09:00:00.000Z'),
                lastActivatedAt: new Date('2026-04-07T08:30:00.000Z'),
                lastRejectedAt: null,
            },
        });

        expect(afterTrustRevoked.lifecycleState).toBe('Re-onboarding Required');

        const afterRejectedReconnect = applyLifecycleTransition({
            lifecycleState: afterTrustRevoked.lifecycleState,
            reason: 'activation_rejected',
            at: new Date('2026-04-07T09:05:00.000Z'),
            activation: afterTrustRevoked.activation,
        });

        expect(afterRejectedReconnect.lifecycleState).toBe('Re-onboarding Required');
        expect(afterRejectedReconnect.activation.lastRejectedAt?.toISOString()).toBe(
            '2026-04-07T09:05:00.000Z',
        );

        const telemetryProjection = mapEdgeToTelemetryReadyProjection({
            _id: new Types.ObjectId(),
            name: 'Edge Trust Loss',
            lifecycleState: afterRejectedReconnect.lifecycleState,
            availability: { online: false, lastSeenAt: null },
            persistentCredential: createPersistentCredentialMetadata({
                secretHash: 'persistent-hash',
                previousVersion: 0,
                issuedAt: revokedAt,
            }),
        });

        expect(telemetryProjection).toBeNull();
    });
});
