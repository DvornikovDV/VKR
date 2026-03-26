import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
    applyLifecycleTransition,
    createOnboardingPackageMetadata,
    createPersistentCredentialMetadata,
    generateCredentialSecret,
    hashCredentialSecret,
    verifyCredentialSecret,
} from '../../src/services/edge-onboarding.service';
import { mapEdgeToAdminProjection, mapEdgeToTelemetryReadyProjection } from '../../src/services/edge-servers.service';

export async function run(): Promise<void> {
    const firstSecret = generateCredentialSecret();
    const secondSecret = generateCredentialSecret();

    assert.ok(firstSecret.length >= 32);
    assert.notEqual(firstSecret, secondSecret);

    const secretHash = await hashCredentialSecret(firstSecret);
    assert.equal(await verifyCredentialSecret(firstSecret, secretHash), true);
    assert.equal(await verifyCredentialSecret('invalid-secret', secretHash), false);

    const issuedAt = new Date('2026-03-26T00:00:00.000Z');
    const onboardingPackage = createOnboardingPackageMetadata({
        issuedBy: new Types.ObjectId(),
        secretHash,
        issuedAt,
    });
    assert.equal(onboardingPackage.status, 'ready');
    assert.equal(onboardingPackage.issuedAt.toISOString(), issuedAt.toISOString());
    assert.ok(onboardingPackage.expiresAt.getTime() > onboardingPackage.issuedAt.getTime());

    const persistentCredential = createPersistentCredentialMetadata({
        secretHash,
        previousVersion: 2,
        issuedAt,
    });
    assert.equal(persistentCredential.version, 3);
    assert.equal(persistentCredential.revokedAt, null);

    const transitioned = applyLifecycleTransition({
        lifecycleState: 'Pending First Connection',
        reason: 'activation_succeeded',
        at: issuedAt,
    });
    assert.equal(transitioned.lifecycleState, 'Active');
    assert.equal(transitioned.activation.lastActivatedAt?.toISOString(), issuedAt.toISOString());

    const projectedAdmin = mapEdgeToAdminProjection({
        _id: new Types.ObjectId(),
        name: 'Edge T006',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: issuedAt },
        trustedUsers: [],
        createdBy: null,
        currentOnboardingPackage: onboardingPackage,
        persistentCredential,
        lastLifecycleEventAt: issuedAt,
    });
    assert.equal(projectedAdmin.isTelemetryReady, true);
    assert.equal(projectedAdmin.persistentCredentialVersion, 3);
    assert.equal('secretHash' in (projectedAdmin.currentOnboardingPackage ?? {}), false);

    const projectedUser = mapEdgeToTelemetryReadyProjection({
        _id: new Types.ObjectId(),
        name: 'Edge T006',
        lifecycleState: 'Active',
        availability: { online: true, lastSeenAt: issuedAt },
    });
    assert.equal(projectedUser?.lifecycleState, 'Active');
}
