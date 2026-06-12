import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { Diagram } from '../../src/models/Diagram';
import { DiagramBindings } from '../../src/models/DiagramBindings';
import { MutationLease } from '../../src/models/MutationLease';
import { User } from '../../src/models/User';
import { DiagramConsistencyService } from '../../src/services/diagram-consistency.service';

beforeAll(async () => {
    await connectDatabase();
    await Diagram.syncIndexes();
});

beforeEach(async () => {
    await Promise.all([
        User.deleteMany({}),
        Diagram.deleteMany({}),
        DiagramBindings.deleteMany({}),
        MutationLease.deleteMany({}),
    ]);
});

afterAll(async () => {
    await disconnectDatabase();
});

describe('DiagramConsistencyService', () => {
    it('idempotently repairs orphan bindings, obsolete locks, and FREE quota slots', async () => {
        const owner = await User.create({
            email: 'diagram_repair@test.com',
            passwordHash: 'not-used',
            role: 'USER',
            subscriptionTier: 'FREE',
        });
        await User.collection.updateOne(
            { _id: owner._id },
            { $set: { diagramQuotaMutationPending: true, diagramQuotaActiveCreates: 7 } },
        );
        const diagrams = await Diagram.create([
            { ownerId: owner._id, name: 'One', layout: {}, quotaSlot: 1 },
            { ownerId: owner._id, name: 'Two', layout: {} },
            { ownerId: owner._id, name: 'Three', layout: {} },
            { ownerId: owner._id, name: 'Excess', layout: {} },
        ]);
        await DiagramBindings.create({
            diagramId: new mongoose.Types.ObjectId(),
            ownerId: owner._id,
            edgeServerId: new mongoose.Types.ObjectId(),
            widgetBindings: [],
        });

        const first = await DiagramConsistencyService.repair();
        const second = await DiagramConsistencyService.repair();

        expect(first.orphanBindingsRemoved).toBe(1);
        expect(first.obsoleteUserLocksCleared).toBe(1);
        expect(second.orphanBindingsRemoved).toBe(0);
        expect(second.obsoleteUserLocksCleared).toBe(0);
        expect(await DiagramBindings.countDocuments({})).toBe(0);
        expect(await User.collection.findOne({ _id: owner._id })).not.toHaveProperty(
            'diagramQuotaMutationPending',
        );

        const repaired = await Diagram.find({ _id: { $in: diagrams.map((diagram) => diagram._id) } }).lean();
        expect(repaired.filter((diagram) => diagram.quotaSlot !== undefined)).toHaveLength(3);
        expect(repaired.filter((diagram) => diagram.quotaSlot === undefined)).toHaveLength(1);
    });
});
