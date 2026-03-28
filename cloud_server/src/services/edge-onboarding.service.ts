import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose, { type Types } from 'mongoose';
import { AppError } from '../api/middlewares/error.middleware';
import { ENV } from '../config/env';
import {
    EdgeServer,
    type EdgeActivationSnapshot,
    type EdgeAvailabilitySnapshot,
    type EdgeLifecycleState,
    type EdgeOnboardingPackageMetadata,
    type EdgePersistentCredentialMetadata,
    type IEdgeServer,
} from '../models/EdgeServer';
import { EdgeOnboardingAuditService } from './edge-onboarding-audit.service';
import {
    mapEdgeToAdminProjection,
    type AdminEdgeProjection,
} from './edge-servers.service';

export const DEFAULT_ONBOARDING_PACKAGE_TTL_MS = ENV.EDGE_ONBOARDING_PACKAGE_TTL_HOURS * 60 * 60 * 1000;
const DEFAULT_BCRYPT_ROUNDS = 10;

const DEFAULT_ONBOARDING_SECRET_BYTES = ENV.EDGE_ONBOARDING_SECRET_BYTES;
const DEFAULT_PERSISTENT_SECRET_BYTES = ENV.EDGE_PERSISTENT_SECRET_BYTES;

export type LifecycleTransitionReason =
    | 'registered'
    | 'activation_succeeded'
    | 'activation_rejected'
    | 'trust_revoked'
    | 'blocked'
    | 'reenabled';

export type CredentialSecretKind = 'onboarding' | 'persistent';

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

export interface OnboardingPackageDisclosure {
    edgeId: string;
    onboardingSecret: string;
    issuedAt: Date;
    expiresAt: Date;
    instructions: string;
}

export interface OnboardingPackageActionResult {
    edge: AdminEdgeProjection;
    onboardingPackage: OnboardingPackageDisclosure;
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

function toObjectId(id: string, label: string): Types.ObjectId {
    if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid ${label}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
}

function buildDisplayHint(secret: string): string {
    return secret.length <= 8 ? secret : `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

function mapEdgeDocumentToAdminProjection(edge: IEdgeServer): AdminEdgeProjection {
    const availability: EdgeAvailabilitySnapshot = edge.availability ?? {
        online: false,
        lastSeenAt: edge.lastSeen ?? null,
    };

    return mapEdgeToAdminProjection({
        _id: edge._id,
        name: edge.name,
        lifecycleState: edge.lifecycleState,
        availability,
        trustedUsers: edge.trustedUsers,
        createdBy: edge.createdBy,
        currentOnboardingPackage: edge.currentOnboardingPackage,
        persistentCredential: edge.persistentCredential,
        lastLifecycleEventAt: edge.lastLifecycleEventAt,
    });
}

function createDisclosure(
    edgeId: string,
    onboardingSecret: string,
    metadata: EdgeOnboardingPackageMetadata,
): OnboardingPackageDisclosure {
    return {
        edgeId,
        onboardingSecret,
        issuedAt: metadata.issuedAt,
        expiresAt: metadata.expiresAt,
        instructions: 'Use this secret with credentialMode=onboarding for first connection.',
    };
}

export function generateCredentialSecret(secretBytes = DEFAULT_ONBOARDING_SECRET_BYTES): string {
    return randomBytes(secretBytes).toString('base64url');
}

export function generateCredentialSecretForKind(
    kind: CredentialSecretKind,
    secretBytes?: number,
): string {
    const defaultSecretBytes =
        kind === 'persistent' ? DEFAULT_PERSISTENT_SECRET_BYTES : DEFAULT_ONBOARDING_SECRET_BYTES;
    return randomBytes(secretBytes ?? defaultSecretBytes).toString('base64url');
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

async function registerEdgeServer(
    name: string,
    adminId: string,
): Promise<OnboardingPackageActionResult> {
    const adminObjectId = toObjectId(adminId, 'adminId');
    const onboardingSecret = generateCredentialSecretForKind('onboarding');
    const onboardingSecretHash = await hashCredentialSecret(onboardingSecret);
    const issuedAt = new Date();
    const onboardingPackage = createOnboardingPackageMetadata({
        issuedBy: adminObjectId,
        secretHash: onboardingSecretHash,
        issuedAt,
        displayHint: buildDisplayHint(onboardingSecret),
    });

    const lifecycleTransition = applyLifecycleTransition({
        lifecycleState: 'Pending First Connection',
        reason: 'registered',
        at: issuedAt,
    });

    const edge = await EdgeServer.create({
        name,
        // Legacy compatibility field remains required by schema.
        apiKeyHash: onboardingSecretHash,
        createdBy: adminObjectId,
        lifecycleState: lifecycleTransition.lifecycleState,
        activation: lifecycleTransition.activation,
        availability: { online: false, lastSeenAt: null },
        currentOnboardingPackage: onboardingPackage,
        persistentCredential: null,
        lastLifecycleEventAt: lifecycleTransition.occurredAt,
    });

    const edgeId = edge._id.toString();
    await EdgeOnboardingAuditService.recordRegistered({
        edgeId,
        adminId,
        details: { lifecycleState: edge.lifecycleState },
    });
    await EdgeOnboardingAuditService.writeEvent({
        edgeId,
        type: 'onboarding_issued',
        actorType: 'admin',
        actorId: adminId,
        details: {
            credentialId: onboardingPackage.credentialId,
            expiresAt: onboardingPackage.expiresAt.toISOString(),
        },
    });

    return {
        edge: mapEdgeDocumentToAdminProjection(edge),
        onboardingPackage: createDisclosure(edgeId, onboardingSecret, onboardingPackage),
    };
}

async function resetOnboardingCredentials(
    edgeId: string,
    adminId: string,
): Promise<OnboardingPackageActionResult> {
    const adminObjectId = toObjectId(adminId, 'adminId');
    const edgeObjectId = toObjectId(edgeId, 'edgeId');
    const edge = await EdgeServer.findById(edgeObjectId).exec();

    if (!edge) {
        throw new AppError('Edge server not found', 404);
    }

    if (edge.lifecycleState === 'Blocked') {
        throw new AppError('Blocked edge cannot reset onboarding credentials', 409);
    }

    const previousCredentialId = edge.currentOnboardingPackage?.credentialId ?? null;
    const onboardingSecret = generateCredentialSecretForKind('onboarding');
    const onboardingSecretHash = await hashCredentialSecret(onboardingSecret);
    const issuedAt = new Date();
    const onboardingPackage = createOnboardingPackageMetadata({
        issuedBy: adminObjectId,
        secretHash: onboardingSecretHash,
        issuedAt,
        displayHint: buildDisplayHint(onboardingSecret),
    });

    edge.currentOnboardingPackage = onboardingPackage;
    // Keep legacy credential source in sync until socket handshake fully migrates off apiKeyHash.
    edge.apiKeyHash = onboardingSecretHash;
    edge.lastLifecycleEventAt = issuedAt;
    await edge.save();

    await EdgeOnboardingAuditService.recordOnboardingReset({
        edgeId,
        adminId,
        details: {
            previousCredentialId,
            nextCredentialId: onboardingPackage.credentialId,
        },
    });

    return {
        edge: mapEdgeDocumentToAdminProjection(edge),
        onboardingPackage: createDisclosure(edgeId, onboardingSecret, onboardingPackage),
    };
}

export const EdgeOnboardingService = {
    generateCredentialSecret,
    generateCredentialSecretForKind,
    hashCredentialSecret,
    verifyCredentialSecret,
    createOnboardingPackageMetadata,
    createPersistentCredentialMetadata,
    applyLifecycleTransition,
    registerEdgeServer,
    resetOnboardingCredentials,
};
