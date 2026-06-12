import { randomUUID } from 'node:crypto';
import { AppError } from '../api/middlewares/error.middleware';
import { MutationLease } from '../models/MutationLease';

const LEASE_DURATION_MS = 30_000;
const LEASE_WAIT_ATTEMPTS = 100;
const LEASE_WAIT_MS = 20;
export const RESOURCE_MUTATION_IN_PROGRESS = 'Resource mutation is in progress';

interface DuplicateKeyError {
    code?: number;
}

interface HeldLease {
    resourceKey: string;
    token: string;
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
    return typeof error === 'object' && error !== null && (error as DuplicateKeyError).code === 11000;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function expirationFromNow(): Date {
    return new Date(Date.now() + LEASE_DURATION_MS);
}

async function acquireLease(resourceKey: string): Promise<HeldLease> {
    const token = randomUUID();

    for (let attempt = 0; attempt < LEASE_WAIT_ATTEMPTS; attempt += 1) {
        try {
            const lease = await MutationLease.findOneAndUpdate(
                {
                    _id: resourceKey,
                    expiresAt: { $lte: new Date() },
                },
                {
                    $set: { token, expiresAt: expirationFromNow() },
                    $setOnInsert: { resourceKey },
                },
                { new: true, upsert: true },
            ).lean().exec();

            if (lease?.token === token) {
                return { resourceKey, token };
            }
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
        }
        await sleep(LEASE_WAIT_MS);
    }

    throw new AppError(RESOURCE_MUTATION_IN_PROGRESS, 409);
}

async function releaseLease(lease: HeldLease): Promise<void> {
    await MutationLease.deleteOne({
        _id: lease.resourceKey,
        token: lease.token,
    }).exec();
}

async function renewLeases(leases: HeldLease[]): Promise<void> {
    await Promise.all(
        leases.map((lease) =>
            MutationLease.updateOne(
                { _id: lease.resourceKey, token: lease.token },
                { $set: { expiresAt: expirationFromNow() } },
            ).exec(),
        ),
    );
}

async function runWithMutationLeases<T>(
    resourceKeys: string[],
    operation: () => Promise<T>,
): Promise<T> {
    const keys = [...new Set(resourceKeys)].sort();
    const held: HeldLease[] = [];

    try {
        for (const key of keys) {
            held.push(await acquireLease(key));
        }

        const renewal = setInterval(() => {
            void renewLeases(held).catch(() => {
                // Expiration remains the crash-safe fallback if renewal temporarily fails.
            });
        }, LEASE_DURATION_MS / 3);
        renewal.unref();

        try {
            return await operation();
        } finally {
            clearInterval(renewal);
        }
    } finally {
        await Promise.allSettled([...held].reverse().map(releaseLease));
    }
}

export const MutationLeaseService = {
    runWithMutationLeases,
};
