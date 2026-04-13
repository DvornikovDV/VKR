import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { ENV } from '../config/env';
import type {
    EdgeAvailabilitySnapshot,
    EdgePersistentCredentialMetadata,
} from '../models/EdgeServer';

const DEFAULT_BCRYPT_ROUNDS = 10;

export interface EdgeLifecycleAggregateState {
    lifecycleState: 'Active' | 'Blocked';
    availability: EdgeAvailabilitySnapshot;
    persistentCredential: EdgePersistentCredentialMetadata | null;
    lastLifecycleEventAt: Date | null;
}

interface CreatePersistentCredentialMetadataInput {
    secretHash: string;
    previousVersion?: number | null;
    issuedAt?: Date;
}

interface RegisterEdgeAggregateInput {
    secretHash: string;
    now?: Date;
}

interface RotateEdgeCredentialAggregateInput {
    nextSecretHash: string;
    now?: Date;
}

interface BlockEdgeAggregateInput {
    now?: Date;
}

interface UnblockEdgeAggregateInput {
    nextSecretHash: string;
    now?: Date;
}

export function generatePersistentCredentialSecret(
    secretBytes = ENV.EDGE_PERSISTENT_SECRET_BYTES,
): string {
    return randomBytes(secretBytes).toString('base64url');
}

export async function hashPersistentCredentialSecret(
    plainSecret: string,
    rounds = DEFAULT_BCRYPT_ROUNDS,
): Promise<string> {
    return bcrypt.hash(plainSecret, rounds);
}

export function createPersistentCredentialMetadata(
    input: CreatePersistentCredentialMetadataInput,
): EdgePersistentCredentialMetadata {
    return {
        version: (input.previousVersion ?? 0) + 1,
        secretHash: input.secretHash,
        issuedAt: input.issuedAt ?? new Date(),
        lastAcceptedAt: null,
    };
}

function normalizeAvailabilitySnapshot(
    availability?: EdgeAvailabilitySnapshot | null,
): EdgeAvailabilitySnapshot {
    return {
        online: availability?.online ?? false,
        lastSeenAt: availability?.lastSeenAt ?? null,
    };
}

export function registerEdgeAggregate(
    input: RegisterEdgeAggregateInput,
): EdgeLifecycleAggregateState {
    const now = input.now ?? new Date();

    return {
        lifecycleState: 'Active',
        availability: { online: false, lastSeenAt: null },
        persistentCredential: createPersistentCredentialMetadata({
            secretHash: input.secretHash,
            issuedAt: now,
        }),
        lastLifecycleEventAt: now,
    };
}

export function rotateEdgeCredentialAggregate(
    current: EdgeLifecycleAggregateState,
    input: RotateEdgeCredentialAggregateInput,
): EdgeLifecycleAggregateState {
    const now = input.now ?? new Date();

    return {
        lifecycleState: 'Active',
        availability: normalizeAvailabilitySnapshot(current.availability),
        persistentCredential: createPersistentCredentialMetadata({
            secretHash: input.nextSecretHash,
            previousVersion: current.persistentCredential?.version ?? null,
            issuedAt: now,
        }),
        lastLifecycleEventAt: now,
    };
}

export function blockEdgeAggregate(
    current: EdgeLifecycleAggregateState,
    input: BlockEdgeAggregateInput,
): EdgeLifecycleAggregateState {
    const now = input.now ?? new Date();
    const availability = normalizeAvailabilitySnapshot(current.availability);

    return {
        lifecycleState: 'Blocked',
        availability: {
            online: false,
            lastSeenAt: availability.lastSeenAt,
        },
        persistentCredential: current.persistentCredential ?? null,
        lastLifecycleEventAt: now,
    };
}

export function unblockEdgeAggregate(
    current: EdgeLifecycleAggregateState,
    input: UnblockEdgeAggregateInput,
): EdgeLifecycleAggregateState {
    const now = input.now ?? new Date();
    const availability = normalizeAvailabilitySnapshot(current.availability);

    return {
        lifecycleState: 'Active',
        availability: {
            online: false,
            lastSeenAt: availability.lastSeenAt,
        },
        persistentCredential: createPersistentCredentialMetadata({
            secretHash: input.nextSecretHash,
            previousVersion: current.persistentCredential?.version ?? null,
            issuedAt: now,
        }),
        lastLifecycleEventAt: now,
    };
}
