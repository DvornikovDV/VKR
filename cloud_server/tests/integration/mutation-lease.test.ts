import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { MutationLease } from '../../src/models/MutationLease';
import { MutationLeaseService } from '../../src/services/mutation-lease.service';

beforeAll(async () => {
    await connectDatabase();
    await MutationLease.syncIndexes();
});

beforeEach(async () => {
    await MutationLease.deleteMany({});
});

afterAll(async () => {
    await MutationLease.deleteMany({});
    await disconnectDatabase();
});

describe('MutationLeaseService', () => {
    it('reclaims an expired lease and releases it after the operation', async () => {
        await MutationLease.create({
            _id: 'user:expired',
            resourceKey: 'user:expired',
            token: 'crashed-process',
            expiresAt: new Date(Date.now() - 1_000),
        });

        await MutationLeaseService.runWithMutationLeases(['user:expired'], async () => {
            const held = await MutationLease.findOne({ resourceKey: 'user:expired' }).lean();
            expect(held?.token).not.toBe('crashed-process');
        });

        expect(await MutationLease.exists({ resourceKey: 'user:expired' })).toBeNull();
    });

    it('does not release a lease whose token changed to another owner', async () => {
        await MutationLeaseService.runWithMutationLeases(['diagram:token-owner'], async () => {
            await MutationLease.updateOne(
                { _id: 'diagram:token-owner' },
                {
                    $set: {
                        token: 'new-owner',
                        expiresAt: new Date(Date.now() + 30_000),
                    },
                },
            );
        });

        expect(await MutationLease.findOne({ resourceKey: 'diagram:token-owner' }).lean())
            .toMatchObject({ token: 'new-owner' });
    });
});
