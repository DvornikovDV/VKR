/**
 * Integration proof for independent Admin template-copy assignment.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app } from '../../src/app';
import { User } from '../../src/models/User';
import { Diagram } from '../../src/models/Diagram';
import { DiagramBindings } from '../../src/models/DiagramBindings';
import { AuthService } from '../../src/services/auth.service';
import {
    DiagramQuotaService,
    DUPLICATE_DIAGRAM_ASSIGNMENT,
    DIAGRAM_QUOTA_EXCEEDED,
} from '../../src/services/diagram-quota.service';

// ── Test state ────────────────────────────────────────────────────────────

let adminToken: string;
let adminId: string;

let regularUserId: string;

// ── Helpers ───────────────────────────────────────────────────────────────

async function createAdminUser(email: string): Promise<{ token: string; userId: string }> {
    // Register then force role to ADMIN directly in DB
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN' });
    // Re-login to get token with ADMIN role embedded
    const { token: adminToken } = await AuthService.login(email, 'password1234');
    return { token: adminToken, userId: user._id.toString() };
}

async function createDiagram(ownerId: string, name = 'Test Diagram') {
    return Diagram.create({
        ownerId: new mongoose.Types.ObjectId(ownerId),
        name,
        layout: { widgets: [] },
    });
}

async function createQuotaOwner(
    role: 'ADMIN' | 'USER' = 'USER',
    subscriptionTier: 'FREE' | 'PRO' = 'FREE',
): Promise<mongoose.Types.ObjectId> {
    const owner = await User.create({
        email: `quota_${new mongoose.Types.ObjectId().toString()}@test.com`,
        passwordHash: 'not-used-in-quota-tests',
        role,
        subscriptionTier,
    });
    return owner._id;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeAll(async () => {
    await connectDatabase();
    await User.deleteMany({});
    await Diagram.deleteMany({});
    await DiagramBindings.deleteMany({});
    await Diagram.syncIndexes();

    // Create admin user
    ({ token: adminToken, userId: adminId } = await createAdminUser('admin_assign@test.com'));

    // Create regular user (target for assignment)
    const result = await AuthService.register('regular_assign@test.com', 'password1234');
    regularUserId = result.user._id.toString();
});

describe('T001-T003 diagram quota and provenance foundation', () => {
    it('allows concurrent FREE creation to claim only quota slots 1..3', async () => {
        const ownerId = await createQuotaOwner();

        const results = await Promise.allSettled(
            Array.from({ length: 8 }, (_, index) =>
                DiagramQuotaService.createDiagram(ownerId, 'USER', 'FREE', {
                    name: `Concurrent ${index}`,
                    layout: {},
                }),
            ),
        );

        const fulfilled = results.filter((result) => result.status === 'fulfilled');
        const rejected = results.filter((result) => result.status === 'rejected');

        expect(fulfilled).toHaveLength(3);
        expect(rejected).toHaveLength(5);
        expect(
            rejected.every(
                (result) =>
                    result.status === 'rejected'
                    && result.reason?.message === DIAGRAM_QUOTA_EXCEEDED,
            ),
        ).toBe(true);

        const owned = await Diagram.find({ ownerId }).sort({ quotaSlot: 1 }).lean();
        expect(owned).toHaveLength(3);
        expect(owned.map((diagram) => diagram.quotaSlot)).toEqual([1, 2, 3]);
    });

    it('blocks quota-excess FREE owners, then permits one creation after deletion without provenance', async () => {
        const ownerId = await createQuotaOwner();
        await Diagram.create(
            Array.from({ length: 4 }, (_, index) => ({
                ownerId,
                name: `Former PRO ${index}`,
                layout: {},
            })),
        );

        await expect(
            DiagramQuotaService.createDiagram(ownerId, 'USER', 'FREE', {
                name: 'Blocked after downgrade',
                layout: {},
            }),
        ).rejects.toMatchObject({ message: DIAGRAM_QUOTA_EXCEEDED });

        const twoOldest = await Diagram.find({ ownerId })
            .sort({ createdAt: 1 })
            .limit(2)
            .select('_id')
            .lean();
        await Diagram.deleteMany({ _id: { $in: twoOldest.map((diagram) => diagram._id) } });

        const created = await DiagramQuotaService.createDiagram(ownerId, 'USER', 'FREE', {
            name: 'Ordinary Save As',
            layout: {},
        });

        expect([1, 2, 3]).toContain(created.quotaSlot);
        expect(created.sourceTemplateId).toBeUndefined();
        expect(await Diagram.countDocuments({ ownerId })).toBe(3);
    });

    it('uses named partial unique indexes and returns a stable duplicate-assignment outcome', async () => {
        const ownerId = await createQuotaOwner('USER', 'PRO');
        const sourceTemplateId = new mongoose.Types.ObjectId();
        const indexes = await Diagram.collection.indexes();

        expect(indexes).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'uniq_diagram_owner_source_template',
                unique: true,
                partialFilterExpression: { sourceTemplateId: { $type: 'objectId' } },
            }),
            expect.objectContaining({
                name: 'uniq_diagram_owner_quota_slot',
                unique: true,
                partialFilterExpression: { quotaSlot: { $type: 'number' } },
            }),
        ]));

        const firstWave = await Promise.allSettled([
            DiagramQuotaService.createDiagram(ownerId, 'USER', 'PRO', {
                name: 'Assigned copy A',
                layout: {},
                sourceTemplateId,
            }),
            DiagramQuotaService.createDiagram(ownerId, 'USER', 'PRO', {
                name: 'Assigned copy B',
                layout: {},
                sourceTemplateId,
            }),
        ]);

        expect(firstWave.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(firstWave.filter((result) => result.status === 'rejected')).toHaveLength(1);

        await expect(
            DiagramQuotaService.createDiagram(ownerId, 'USER', 'PRO', {
                name: 'Assigned copy repeated',
                layout: {},
                sourceTemplateId,
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: DUPLICATE_DIAGRAM_ASSIGNMENT,
        });
        expect(await Diagram.countDocuments({ ownerId, sourceTemplateId })).toBe(1);
    });

    it('returns duplicate assignment instead of quota when a FREE owner is already full', async () => {
        const ownerId = await createQuotaOwner();
        const sourceTemplateId = new mongoose.Types.ObjectId();

        await Diagram.create([
            { ownerId, name: 'Assigned copy', layout: {}, sourceTemplateId, quotaSlot: 1 },
            { ownerId, name: 'Other copy A', layout: {}, quotaSlot: 2 },
            { ownerId, name: 'Other copy B', layout: {}, quotaSlot: 3 },
        ]);

        await expect(
            DiagramQuotaService.createDiagram(ownerId, 'USER', 'FREE', {
                name: 'Repeated assigned copy',
                layout: {},
                sourceTemplateId,
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: DUPLICATE_DIAGRAM_ASSIGNMENT,
        });
        expect(await Diagram.countDocuments({ ownerId })).toBe(3);
    });
});

afterAll(async () => {
    await User.deleteMany({});
    await Diagram.deleteMany({});
    await DiagramBindings.deleteMany({});
    await disconnectDatabase();
});

beforeEach(async () => {
    await Diagram.deleteMany({});
    await DiagramBindings.deleteMany({});
    await User.findByIdAndUpdate(regularUserId, {
        role: 'USER',
        subscriptionTier: 'FREE',
        isDeleted: false,
        isBanned: false,
        diagramQuotaMutationPending: false,
        diagramQuotaActiveCreates: 0,
    });
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('T014-T018 template-copy assignment proof', () => {
    it('creates one independent binding-free copy from the latest persisted Admin template', async () => {
        const template = await createDiagram(adminId, 'Admin Template');
        const latestLayout = {
            widgets: [{ id: 'latest-widget', x: 42 }],
            images: [{ id: 'persisted-image' }],
        };
        await Diagram.findByIdAndUpdate(template._id, {
            name: 'Latest Persisted Template',
            layout: latestLayout,
        });
        await DiagramBindings.create({
            diagramId: template._id,
            ownerId: new mongoose.Types.ObjectId(adminId),
            edgeServerId: new mongoose.Types.ObjectId(),
            widgetBindings: [{ widgetId: 'latest-widget', deviceId: 'd1', metric: 'temp' }],
        });

        const res = await request(app)
            .post(`/api/diagrams/${template._id.toString()}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ targetUserId: regularUserId });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.data._id).not.toBe(template._id.toString());
        expect(res.body.data.ownerId).toBe(regularUserId);
        expect(res.body.data.sourceTemplateId).toBe(template._id.toString());
        expect(res.body.data.name).toBe('Latest Persisted Template');
        expect(res.body.data.layout).toEqual(latestLayout);

        const preservedTemplate = await Diagram.findById(template._id).lean();
        expect(preservedTemplate?.ownerId.toString()).toBe(adminId);
        expect(preservedTemplate?.layout).toEqual(latestLayout);
        expect(await DiagramBindings.countDocuments({ diagramId: template._id })).toBe(1);

        const copy = await Diagram.findById(res.body.data._id).lean();
        expect(copy?.ownerId.toString()).toBe(regularUserId);
        expect(copy?.sourceTemplateId?.toString()).toBe(template._id.toString());
        expect(await DiagramBindings.countDocuments({ diagramId: copy?._id })).toBe(0);

        const deleteResponse = await request(app)
            .delete(`/api/diagrams/${template._id.toString()}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(deleteResponse.status).toBe(204);
        expect(await Diagram.findById(template._id).lean()).toBeNull();
        expect(await Diagram.findById(copy?._id).lean()).toMatchObject({
            name: 'Latest Persisted Template',
            layout: latestLayout,
        });
    });

    it('rejects concurrent duplicates and stale persisted ownership, account state, or quota', async () => {
        const duplicateTemplate = await createDiagram(adminId, 'Concurrent Template');

        const duplicateResponses = await Promise.all([
            request(app)
                .post(`/api/diagrams/${duplicateTemplate._id.toString()}/assign`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ targetUserId: regularUserId }),
            request(app)
                .post(`/api/diagrams/${duplicateTemplate._id.toString()}/assign`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ targetUserId: regularUserId }),
        ]);

        expect(duplicateResponses.map((response) => response.status).sort()).toEqual([200, 409]);
        expect(duplicateResponses.find((response) => response.status === 409)?.body.message)
            .toBe(DUPLICATE_DIAGRAM_ASSIGNMENT);
        expect(await Diagram.countDocuments({
            ownerId: new mongoose.Types.ObjectId(regularUserId),
            sourceTemplateId: duplicateTemplate._id,
        })).toBe(1);

        const notOwnedTemplate = await createDiagram(regularUserId, 'Not Admin Owned');
        const notOwnedResponse = await request(app)
            .post(`/api/diagrams/${notOwnedTemplate._id.toString()}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ targetUserId: regularUserId });

        expect(notOwnedResponse.status).toBe(403);
        expect((await Diagram.findById(notOwnedTemplate._id).lean())?.ownerId.toString())
            .toBe(regularUserId);

        await User.findByIdAndUpdate(regularUserId, { isBanned: true });
        const bannedTargetTemplate = await createDiagram(adminId, 'Stale Active Target');
        const bannedTargetResponse = await request(app)
            .post(`/api/diagrams/${bannedTargetTemplate._id.toString()}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ targetUserId: regularUserId });

        expect(bannedTargetResponse.status).toBe(403);
        expect(await Diagram.countDocuments({
            ownerId: new mongoose.Types.ObjectId(regularUserId),
            sourceTemplateId: bannedTargetTemplate._id,
        })).toBe(0);

        const quotaFullUserId = await createQuotaOwner();
        await Diagram.create([
            { ownerId: quotaFullUserId, name: 'Full 1', layout: {}, quotaSlot: 1 },
            { ownerId: quotaFullUserId, name: 'Full 2', layout: {}, quotaSlot: 2 },
            { ownerId: quotaFullUserId, name: 'Full 3', layout: {}, quotaSlot: 3 },
        ]);
        const quotaTemplate = await createDiagram(adminId, 'Stale Eligibility Template');

        const quotaResponse = await request(app)
            .post(`/api/diagrams/${quotaTemplate._id.toString()}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ targetUserId: quotaFullUserId.toString() });

        expect(quotaResponse.status).toBe(403);
        expect(quotaResponse.body.message).toBe(DIAGRAM_QUOTA_EXCEEDED);
        expect(await Diagram.countDocuments({
            ownerId: quotaFullUserId,
            sourceTemplateId: quotaTemplate._id,
        })).toBe(0);
        expect((await Diagram.findById(quotaTemplate._id).lean())?.ownerId.toString()).toBe(adminId);
    });
});
