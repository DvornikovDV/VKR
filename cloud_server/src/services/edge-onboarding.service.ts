import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { type Types } from 'mongoose';
import {
    type EdgeActivationSnapshot,
    type EdgeLifecycleState,
    type EdgeOnboardingPackageMetadata,
    type EdgePersistentCredentialMetadata,
} from '../models/EdgeServer';

export const DEFAULT_ONBOARDING_PACKAGE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BCRYPT_ROUNDS = 10;

const DEFAULT_SECRET_BYTES = 32;

export type LifecycleTransitionReason =
    | 'registered'
    | 'activation_succeeded'
    | 'activation_rejected'
    | 'trust_revoked'
    | 'blocked'
    | 'reenabled';

interface CreateOnboardingPackageMetadataInput {
    issuedBy: Types.ObjectId | null;
    secretHash: string;
    issuedAt?: Date;
    expiresAt?: Date;
    displayHint?: string | null;
    credentialId?: string;
}

interface CreatePersistentCredentialMetadataInput {
    secretHash: string;
    previousVersion?: number | null;
    issuedAt?: Date;
}

interface ApplyLifecycleTransitionInput {
    lifecycleState: EdgeLifecycleState;
    reason: LifecycleTransitionReason;
    at?: Date;
    activation?: EdgeActivationSnapshot | null;
}

interface LifecycleTransitionResult {
    lifecycleState: EdgeLifecycleState;
    activation: EdgeActivationSnapshot;
    occurredAt: Date;
}

function withActivationDefaults(
    activation?: EdgeActivationSnapshot | null,
): EdgeActivationSnapshot {
    return {
        firstActivatedAt: activation?.firstActivatedAt ?? null,
        lastActivatedAt: activation?.lastActivatedAt ?? null,
        lastRejectedAt: activation?.lastRejectedAt ?? null,
    };
}

export function generateCredentialSecret(secretBytes = DEFAULT_SECRET_BYTES): string {
    return randomBytes(secretBytes).toString('base64url');
}

export async function hashCredentialSecret(
    plainSecret: string,
    rounds = DEFAULT_BCRYPT_ROUNDS,
): Promise<string> {
    return bcrypt.hash(plainSecret, rounds);
}

export async function verifyCredentialSecret(
    plainSecret: string,
    secretHash: string,
): Promise<boolean> {
    return bcrypt.compare(plainSecret, secretHash);
}

export function createOnboardingPackageMetadata(
    input: CreateOnboardingPackageMetadataInput,
): EdgeOnboardingPackageMetadata {
    const issuedAt = input.issuedAt ?? new Date();
    const expiresAt = input.expiresAt ?? new Date(issuedAt.getTime() + DEFAULT_ONBOARDING_PACKAGE_TTL_MS);

    return {
        credentialId: input.credentialId ?? randomUUID(),
        secretHash: input.secretHash,
        displayHint: input.displayHint ?? null,
        issuedAt,
        expiresAt,
        issuedBy: input.issuedBy,
        status: 'ready',
        usedAt: null,
        supersededByCredentialId: null,
    };
}

export function createPersistentCredentialMetadata(
    input: CreatePersistentCredentialMetadataInput,
): EdgePersistentCredentialMetadata {
    return {
        version: (input.previousVersion ?? 0) + 1,
        secretHash: input.secretHash,
        issuedAt: input.issuedAt ?? new Date(),
        lastAcceptedAt: null,
        revokedAt: null,
        revocationReason: null,
    };
}

export function applyLifecycleTransition(
    input: ApplyLifecycleTransitionInput,
): LifecycleTransitionResult {
    const at = input.at ?? new Date();
    const activation = withActivationDefaults(input.activation);

    switch (input.reason) {
        case 'registered':
            return {
                lifecycleState: 'Pending First Connection',
                activation,
                occurredAt: at,
            };

        case 'activation_succeeded':
            return {
                lifecycleState: 'Active',
                activation: {
                    ...activation,
                    firstActivatedAt: activation.firstActivatedAt ?? at,
                    lastActivatedAt: at,
                },
                occurredAt: at,
            };

        case 'activation_rejected':
            return {
                lifecycleState: input.lifecycleState,
                activation: {
                    ...activation,
                    lastRejectedAt: at,
                },
                occurredAt: at,
            };

        case 'trust_revoked':
            return {
                lifecycleState: 'Re-onboarding Required',
                activation,
                occurredAt: at,
            };

        case 'blocked':
            return {
                lifecycleState: 'Blocked',
                activation,
                occurredAt: at,
            };

        case 'reenabled':
            return {
                lifecycleState: 'Re-onboarding Required',
                activation,
                occurredAt: at,
            };
    }
}

export const EdgeOnboardingService = {
    generateCredentialSecret,
    hashCredentialSecret,
    verifyCredentialSecret,
    createOnboardingPackageMetadata,
    createPersistentCredentialMetadata,
    applyLifecycleTransition,
};
