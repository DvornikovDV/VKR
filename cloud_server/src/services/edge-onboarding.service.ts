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
    type OnboardingPackageStatus,
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
export type EdgeAuthRejectionCode =
    | 'edge_not_found'
    | 'blocked'
    | 'onboarding_not_allowed'
    | 'onboarding_package_missing'
    | 'onboarding_package_expired'
    | 'onboarding_package_reused'
    | 'invalid_credential'
    | 'persistent_credential_revoked';

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

interface RotatePersistentCredentialMetadataInput {
    nextSecretHash: string;
    previousCredential?: EdgePersistentCredentialMetadata | null;
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

export interface EdgeActivationPayload {
    edgeId: string;
    lifecycleState: 'Active';
    persistentCredential: {
        version: number;
        secret: string;
        issuedAt: string;
    };
}

interface AuthenticateEdgeHandshakeInput {
    edgeId: string;
    credentialMode: CredentialSecretKind;
    credentialSecret: string;
    now?: Date;
}

export type AuthenticateEdgeHandshakeResult =
    | {
        ok: true;
        edgeId: string;
        credentialMode: CredentialSecretKind;
        lifecycleState: 'Active';
        edgeActivation: EdgeActivationPayload | null;
    }
    | {
        ok: false;
        code: EdgeAuthRejectionCode;
    };

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

export function rotatePersistentCredentialMetadata(
    input: RotatePersistentCredentialMetadataInput,
): EdgePersistentCredentialMetadata {
    return createPersistentCredentialMetadata({
        secretHash: input.nextSecretHash,
        previousVersion: input.previousCredential?.version ?? null,
        issuedAt: input.issuedAt,
    });
}

export function isOnboardingPackageExpired(
    metadata: Pick<EdgeOnboardingPackageMetadata, 'status' | 'expiresAt'>,
    now = new Date(),
): boolean {
    return metadata.status === 'ready' && metadata.expiresAt.getTime() <= now.getTime();
}

export function resolveOnboardingPackageStatus(
    metadata: Pick<EdgeOnboardingPackageMetadata, 'status' | 'expiresAt'>,
    now = new Date(),
): OnboardingPackageStatus {
    if (isOnboardingPackageExpired(metadata, now)) {
        return 'expired';
    }
    return metadata.status;
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

function applyCredentialRejectionTransition(edge: IEdgeServer, at: Date): void {
    const transition = applyLifecycleTransition({
        lifecycleState: edge.lifecycleState,
        reason: 'activation_rejected',
        at,
        activation: edge.activation,
    });
    edge.activation = transition.activation;
    edge.lastLifecycleEventAt = transition.occurredAt;
}

async function recordActivationRejectedAuditEvent(input: {
    edge: IEdgeServer;
    credentialMode: CredentialSecretKind;
    code: EdgeAuthRejectionCode;
    now: Date;
    details?: Record<string, unknown>;
}): Promise<void> {
    await EdgeOnboardingAuditService.recordActivationRejected({
        edgeId: input.edge._id.toString(),
        edgeActorId: input.edge._id.toString(),
        details: {
            credentialMode: input.credentialMode,
            code: input.code,
            occurredAt: input.now.toISOString(),
            lifecycleState: input.edge.lifecycleState,
            ...input.details,
        },
    });
}

function toOnboardingRejectionCode(status: OnboardingPackageStatus): EdgeAuthRejectionCode {
    if (status === 'expired') {
        return 'onboarding_package_expired';
    }

    if (status === 'used' || status === 'reset') {
        return 'onboarding_package_reused';
    }

    if (status === 'blocked') {
        return 'blocked';
    }

    return 'onboarding_not_allowed';
}

async function authenticateWithOnboardingCredential(
    edge: IEdgeServer,
    credentialSecret: string,
    now: Date,
): Promise<AuthenticateEdgeHandshakeResult> {
    if (
        edge.lifecycleState !== 'Pending First Connection' &&
        edge.lifecycleState !== 'Re-onboarding Required'
    ) {
        applyCredentialRejectionTransition(edge, now);
        await edge.save();
        await recordActivationRejectedAuditEvent({
            edge,
            credentialMode: 'onboarding',
            code: 'onboarding_not_allowed',
            now,
        });
        return { ok: false, code: 'onboarding_not_allowed' };
    }

    const onboardingPackage = edge.currentOnboardingPackage;
    if (!onboardingPackage) {
        applyCredentialRejectionTransition(edge, now);
        await edge.save();
        await recordActivationRejectedAuditEvent({
            edge,
            credentialMode: 'onboarding',
            code: 'onboarding_package_missing',
            now,
        });
        return { ok: false, code: 'onboarding_package_missing' };
    }

    const resolvedStatus = resolveOnboardingPackageStatus(onboardingPackage, now);
    if (resolvedStatus !== 'ready') {
        if (onboardingPackage.status !== resolvedStatus) {
            onboardingPackage.status = resolvedStatus;
            if (resolvedStatus === 'expired') {
                edge.lastLifecycleEventAt = now;
            }
        }

        applyCredentialRejectionTransition(edge, now);
        await edge.save();
        const rejectionCode = toOnboardingRejectionCode(resolvedStatus);
        await recordActivationRejectedAuditEvent({
            edge,
            credentialMode: 'onboarding',
            code: rejectionCode,
            now,
            details: { onboardingPackageStatus: resolvedStatus },
        });
        return { ok: false, code: rejectionCode };
    }

    const valid = await verifyCredentialSecret(credentialSecret, onboardingPackage.secretHash);
    if (!valid) {
        applyCredentialRejectionTransition(edge, now);
        await edge.save();
        await recordActivationRejectedAuditEvent({
            edge,
            credentialMode: 'onboarding',
            code: 'invalid_credential',
            now,
        });
        return { ok: false, code: 'invalid_credential' };
    }

    const persistentSecret = generateCredentialSecretForKind('persistent');
    const persistentSecretHash = await hashCredentialSecret(persistentSecret);
    const rotatedPersistentCredential = rotatePersistentCredentialMetadata({
        nextSecretHash: persistentSecretHash,
        previousCredential: edge.persistentCredential,
        issuedAt: now,
    });

    const transition = applyLifecycleTransition({
        lifecycleState: edge.lifecycleState,
        reason: 'activation_succeeded',
        at: now,
        activation: edge.activation,
    });

    const activatedEdge = await EdgeServer.findOneAndUpdate(
        {
            _id: edge._id,
            lifecycleState: { $in: ['Pending First Connection', 'Re-onboarding Required'] },
            'currentOnboardingPackage.credentialId': onboardingPackage.credentialId,
            'currentOnboardingPackage.secretHash': onboardingPackage.secretHash,
            'currentOnboardingPackage.status': 'ready',
            'currentOnboardingPackage.expiresAt': { $gt: now },
        },
        {
            $set: {
                'currentOnboardingPackage.status': 'used',
                'currentOnboardingPackage.usedAt': now,
                persistentCredential: rotatedPersistentCredential,
                lifecycleState: transition.lifecycleState,
                activation: transition.activation,
                lastLifecycleEventAt: transition.occurredAt,
                // Legacy compatibility field remains synchronized with the currently valid credential hash.
                apiKeyHash: persistentSecretHash,
            },
        },
        { new: true },
    ).exec();

    if (!activatedEdge) {
        const latestEdge = await EdgeServer.findById(edge._id).exec();
        if (!latestEdge) {
            return { ok: false, code: 'edge_not_found' };
        }

        applyCredentialRejectionTransition(latestEdge, now);
        await latestEdge.save();

        if (latestEdge.lifecycleState === 'Blocked' || !latestEdge.isActive) {
            await recordActivationRejectedAuditEvent({
                edge: latestEdge,
                credentialMode: 'onboarding',
                code: 'blocked',
                now,
            });
            return { ok: false, code: 'blocked' };
        }

        const latestPackage = latestEdge.currentOnboardingPackage;
        if (!latestPackage) {
            await recordActivationRejectedAuditEvent({
                edge: latestEdge,
                credentialMode: 'onboarding',
                code: 'onboarding_package_missing',
                now,
            });
            return { ok: false, code: 'onboarding_package_missing' };
        }

        const latestStatus = resolveOnboardingPackageStatus(latestPackage, now);
        if (latestStatus !== latestPackage.status) {
            latestPackage.status = latestStatus;
            await latestEdge.save();
        }

        const rejectionCode = toOnboardingRejectionCode(latestStatus);
        await recordActivationRejectedAuditEvent({
            edge: latestEdge,
            credentialMode: 'onboarding',
            code: rejectionCode,
            now,
            details: { onboardingPackageStatus: latestStatus },
        });

        return { ok: false, code: rejectionCode };
    }

    const activatedEdgeId = activatedEdge._id.toString();
    await EdgeOnboardingAuditService.recordActivationSucceeded({
        edgeId: activatedEdgeId,
        edgeActorId: activatedEdgeId,
        details: {
            credentialMode: 'onboarding',
            persistentVersion: rotatedPersistentCredential.version,
        },
    });
    await EdgeOnboardingAuditService.recordPersistentIssued({
        edgeId: activatedEdgeId,
        version: rotatedPersistentCredential.version,
        issuedAt: rotatedPersistentCredential.issuedAt.toISOString(),
        details: {
            lifecycleState: 'Active',
        },
    });

    return {
        ok: true,
        edgeId: activatedEdgeId,
        credentialMode: 'onboarding',
        lifecycleState: 'Active',
        edgeActivation: {
            edgeId: activatedEdgeId,
            lifecycleState: 'Active',
            persistentCredential: {
                version: rotatedPersistentCredential.version,
                secret: persistentSecret,
                issuedAt: rotatedPersistentCredential.issuedAt.toISOString(),
            },
        },
    };
}

async function authenticateWithPersistentCredential(
    edge: IEdgeServer,
    credentialSecret: string,
    now: Date,
): Promise<AuthenticateEdgeHandshakeResult> {
    if (edge.lifecycleState !== 'Active') {
        applyCredentialRejectionTransition(edge, now);
        await edge.save();
        await recordActivationRejectedAuditEvent({
            edge,
            credentialMode: 'persistent',
            code: 'persistent_credential_revoked',
            now,
        });
        return { ok: false, code: 'persistent_credential_revoked' };
    }

    const persistentCredential = edge.persistentCredential;
    if (!persistentCredential || persistentCredential.revokedAt) {
        applyCredentialRejectionTransition(edge, now);
        await edge.save();
        await recordActivationRejectedAuditEvent({
            edge,
            credentialMode: 'persistent',
            code: 'persistent_credential_revoked',
            now,
        });
        return { ok: false, code: 'persistent_credential_revoked' };
    }

    const valid = await verifyCredentialSecret(credentialSecret, persistentCredential.secretHash);
    if (!valid) {
        applyCredentialRejectionTransition(edge, now);
        await edge.save();
        await recordActivationRejectedAuditEvent({
            edge,
            credentialMode: 'persistent',
            code: 'invalid_credential',
            now,
        });
        return { ok: false, code: 'invalid_credential' };
    }

    edge.persistentCredential = {
        ...persistentCredential,
        lastAcceptedAt: now,
    };
    await edge.save();

    return {
        ok: true,
        edgeId: edge._id.toString(),
        credentialMode: 'persistent',
        lifecycleState: 'Active',
        edgeActivation: null,
    };
}

async function authenticateEdgeHandshake(
    input: AuthenticateEdgeHandshakeInput,
): Promise<AuthenticateEdgeHandshakeResult> {
    if (!mongoose.isValidObjectId(input.edgeId)) {
        return { ok: false, code: 'edge_not_found' };
    }

    const edge = await EdgeServer.findById(input.edgeId).exec();
    if (!edge) {
        return { ok: false, code: 'edge_not_found' };
    }

    const now = input.now ?? new Date();

    if (edge.lifecycleState === 'Blocked' || !edge.isActive) {
        await recordActivationRejectedAuditEvent({
            edge,
            credentialMode: input.credentialMode,
            code: 'blocked',
            now,
        });
        return { ok: false, code: 'blocked' };
    }

    if (input.credentialMode === 'onboarding') {
        return authenticateWithOnboardingCredential(edge, input.credentialSecret, now);
    }

    return authenticateWithPersistentCredential(edge, input.credentialSecret, now);
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
    rotatePersistentCredentialMetadata,
    isOnboardingPackageExpired,
    resolveOnboardingPackageStatus,
    applyLifecycleTransition,
    registerEdgeServer,
    resetOnboardingCredentials,
    authenticateEdgeHandshake,
};
