import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_ONBOARDING_PACKAGE_TTL_MS,
    applyLifecycleTransition,
    createOnboardingPackageMetadata,
    createPersistentCredentialMetadata,
    generateCredentialSecret,
    hashCredentialSecret,
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
        });

        expect(telemetryProjection?.lifecycleState).toBe('Active');
    });
});
