/**
 * Unit tests for DiagramsService — quota enforcement and core logic.
 * All MongoDB calls are mocked; no real DB connection needed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock ENV ───────────────────────────────────────────────────────────────
vi.mock('../../src/config/env', () => ({
    ENV: {
        NODE_ENV: 'test',
        PORT: 4001,
        MONGO_URI: 'mongodb://localhost:27017/test',
        JWT_SECRET: 'test_secret_that_is_definitely_long_enough_32chars',
        JWT_EXPIRES_IN: '1h',
        CORS_ORIGINS: ['http://localhost:3000'],
        MAX_PRO_BINDINGS: 0,
    },
}));

// ── Mock Mongoose models ───────────────────────────────────────────────────
vi.mock('../../src/models/Diagram', () => ({
    Diagram: {
        find: vi.fn(),
        findOne: vi.fn(),
        findOneAndUpdate: vi.fn(),
        findOneAndDelete: vi.fn(),
        updateOne: vi.fn(),
        updateMany: vi.fn(),
        countDocuments: vi.fn(),
        exists: vi.fn(),
        create: vi.fn(),
    },
}));

vi.mock('../../src/models/DiagramBindings', () => ({
    DiagramBindings: {
        countDocuments: vi.fn(),
        deleteMany: vi.fn(),
        find: vi.fn(),
    },
}));

vi.mock('../../src/models/User', () => ({
    User: {
        findOneAndUpdate: vi.fn(),
        findOne: vi.fn(),
        findById: vi.fn(),
        updateOne: vi.fn(),
        updateMany: vi.fn(),
        find: vi.fn(),
    },
}));

// ── Imports after mocks ────────────────────────────────────────────────────
import { Diagram } from '../../src/models/Diagram';
import { DiagramBindings } from '../../src/models/DiagramBindings';
import { User } from '../../src/models/User';
import { DiagramsService } from '../../src/services/diagrams.service';
import {
    DiagramQuotaService,
    DUPLICATE_DIAGRAM_ASSIGNMENT,
    DIAGRAM_QUOTA_EXCEEDED,
} from '../../src/services/diagram-quota.service';
import { AppError } from '../../src/api/middlewares/error.middleware';
import mongoose from 'mongoose';

// ── Helpers ───────────────────────────────────────────────────────────────

const OWNER_ID = new mongoose.Types.ObjectId().toString();
const DIAGRAM_ID = new mongoose.Types.ObjectId().toString();

function makeDiagram(overrides: Record<string, unknown> = {}) {
    return {
        _id: new mongoose.Types.ObjectId(),
        ownerId: new mongoose.Types.ObjectId(OWNER_ID),
        name: 'Test Diagram',
        layout: {},
        __v: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

// Chainable mock for Mongoose exec()
function chainable<T>(value: T) {
    return { exec: vi.fn().mockResolvedValue(value) };
}

function selectLeanChain<T>(value: T) {
    return {
        select: vi.fn().mockReturnValue({
            lean: vi.fn().mockReturnValue(chainable(value)),
        }),
    };
}

// ── Test Suites ───────────────────────────────────────────────────────────

describe('DiagramsService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    // ── Quota enforcement ────────────────────────────────────────────────────

    describe('create() — FREE tier quota', () => {
        it('delegates creation to the persisted-owner quota contract', async () => {
            const created = makeDiagram({ name: 'New Diagram' });
            const createForPersistedOwner = vi
                .spyOn(DiagramQuotaService, 'createForPersistedOwner')
                .mockResolvedValue(created as never);

            const result = await DiagramsService.create(OWNER_ID, {
                name: 'New Diagram',
                layout: {},
            });

            expect(result.name).toBe('New Diagram');
            expect(createForPersistedOwner).toHaveBeenCalledWith(OWNER_ID, {
                name: 'New Diagram',
                layout: {},
            });
        });

        it('propagates the stable quota error from the shared contract', async () => {
            vi.spyOn(DiagramQuotaService, 'createForPersistedOwner').mockRejectedValue(
                new AppError(DIAGRAM_QUOTA_EXCEEDED, 403),
            );

            await expect(
                DiagramsService.create(OWNER_ID, { name: 'Extra', layout: {} }),
            ).rejects.toMatchObject({
                statusCode: 403,
                message: DIAGRAM_QUOTA_EXCEEDED,
            });
        });
    });

    // ── OCC update ───────────────────────────────────────────────────────────

    describe('update() — OCC version check', () => {
        it('should return updated diagram on correct __v', async () => {
            const updated = makeDiagram({ __v: 1, name: 'Updated' });
            vi.mocked(Diagram.findOneAndUpdate).mockReturnValue(chainable(updated) as never);
            vi.mocked(DiagramBindings.countDocuments).mockReturnValue(chainable(0) as never);

            const result = await DiagramsService.update(DIAGRAM_ID, OWNER_ID, {
                __v: 0,
                name: 'Updated',
            });

            expect(result.diagram.name).toBe('Updated');
            expect(result.bindingsInvalidated).toBe(false);
        });

        it('should throw 409 on __v mismatch (existing diagram)', async () => {
            vi.mocked(Diagram.findOneAndUpdate).mockReturnValue(chainable(null) as never);
            vi.mocked(Diagram.exists).mockReturnValue(chainable({ _id: DIAGRAM_ID }) as never);

            await expect(
                DiagramsService.update(DIAGRAM_ID, OWNER_ID, { __v: 0 }),
            ).rejects.toMatchObject({ statusCode: 409 });
        });

        it('should throw 404 if diagram does not exist', async () => {
            vi.mocked(Diagram.findOneAndUpdate).mockReturnValue(chainable(null) as never);
            vi.mocked(Diagram.exists).mockReturnValue(chainable(null) as never);

            await expect(
                DiagramsService.update(DIAGRAM_ID, OWNER_ID, { __v: 0 }),
            ).rejects.toMatchObject({ statusCode: 404 });
        });
    });

    // ── hardDelete with cascade ──────────────────────────────────────────────

    describe('hardDelete()', () => {
        it('should delete diagram and cascade-delete bindings', async () => {
            const deleted = makeDiagram();
            vi.mocked(Diagram.findOneAndDelete).mockReturnValue(chainable(deleted) as never);
            vi.mocked(DiagramBindings.deleteMany).mockReturnValue(chainable({ deletedCount: 2 }) as never);
            const mutation = vi
                .spyOn(DiagramQuotaService, 'runWithOwnerQuotaMutation')
                .mockImplementation(async (_ownerId, operation) =>
                    operation({
                        _id: new mongoose.Types.ObjectId(OWNER_ID),
                        role: 'USER',
                        subscriptionTier: 'FREE',
                    }),
                );
            vi.spyOn(DiagramQuotaService, 'reconcileOwnerQuotaSlotsLocked').mockResolvedValue(undefined);

            await DiagramsService.hardDelete(DIAGRAM_ID, OWNER_ID);

            expect(DiagramBindings.deleteMany).toHaveBeenCalledOnce();
            expect(mutation).toHaveBeenCalledOnce();
        });

        it('should throw 404 if diagram not found', async () => {
            vi.mocked(Diagram.findOneAndDelete).mockReturnValue(chainable(null) as never);
            vi.spyOn(DiagramQuotaService, 'runWithOwnerQuotaMutation')
                .mockImplementation(async (_ownerId, operation) =>
                    operation({
                        _id: new mongoose.Types.ObjectId(OWNER_ID),
                        role: 'USER',
                        subscriptionTier: 'FREE',
                    }),
                );

            await expect(DiagramsService.hardDelete(DIAGRAM_ID, OWNER_ID)).rejects.toMatchObject({
                statusCode: 404,
            });

            expect(DiagramBindings.deleteMany).not.toHaveBeenCalled();
        });
    });

    // ── AppError type check ──────────────────────────────────────────────────

    describe('error types', () => {
        it('quota violation should be AppError instance', async () => {
            vi.spyOn(DiagramQuotaService, 'createForPersistedOwner').mockRejectedValue(
                new AppError(DIAGRAM_QUOTA_EXCEEDED, 403),
            );

            const err = await DiagramsService.create(OWNER_ID, {
                name: 'Over',
                layout: {},
            }).catch((e) => e);

            expect(err).toBeInstanceOf(AppError);
            expect(err.isOperational).toBe(true);
        });
    });
});

describe('DiagramQuotaService', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        vi.mocked(User.findOneAndUpdate).mockReturnValue(
            selectLeanChain({
                _id: new mongoose.Types.ObjectId(OWNER_ID),
                role: 'USER',
                subscriptionTier: 'FREE',
            }) as never,
        );
        vi.mocked(User.updateOne).mockReturnValue(chainable({ matchedCount: 1 }) as never);
    });

    it('creates PRO user and Admin diagrams without provenance or quota slots', async () => {
        const created = makeDiagram();
        vi.mocked(Diagram.create).mockResolvedValue(created as never);

        vi.mocked(User.findOneAndUpdate)
            .mockReturnValueOnce(selectLeanChain({
                _id: new mongoose.Types.ObjectId(OWNER_ID),
                role: 'USER',
                subscriptionTier: 'PRO',
            }) as never)
            .mockReturnValueOnce(selectLeanChain({
                _id: new mongoose.Types.ObjectId(OWNER_ID),
                role: 'ADMIN',
                subscriptionTier: 'FREE',
            }) as never);

        await DiagramQuotaService.createDiagram(OWNER_ID, 'USER', 'PRO', {
            name: 'PRO diagram',
            layout: {},
        });
        await DiagramQuotaService.createDiagram(OWNER_ID, 'ADMIN', 'FREE', {
            name: 'Admin template',
            layout: {},
        });

        expect(Diagram.create).toHaveBeenNthCalledWith(1, {
            ownerId: expect.any(mongoose.Types.ObjectId),
            name: 'PRO diagram',
            layout: {},
        });
        expect(Diagram.create).toHaveBeenNthCalledWith(2, {
            ownerId: expect.any(mongoose.Types.ObjectId),
            name: 'Admin template',
            layout: {},
        });
    });

    it('maps the named provenance index conflict to a stable duplicate-assignment error', async () => {
        vi.mocked(User.findOneAndUpdate).mockReturnValue(
            selectLeanChain({
                _id: new mongoose.Types.ObjectId(OWNER_ID),
                role: 'USER',
                subscriptionTier: 'PRO',
            }) as never,
        );
        vi.mocked(Diagram.create).mockRejectedValue({
            code: 11000,
            message: 'duplicate key error index: uniq_diagram_owner_source_template',
        });

        await expect(
            DiagramQuotaService.createDiagram(OWNER_ID, 'USER', 'PRO', {
                name: 'Assigned copy',
                layout: {},
                sourceTemplateId: new mongoose.Types.ObjectId(),
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: DUPLICATE_DIAGRAM_ASSIGNMENT,
        });
    });

    it('does not commit a tier change when reconciliation fails', async () => {
        vi.mocked(User.findOneAndUpdate).mockReturnValue(
            selectLeanChain({
                _id: new mongoose.Types.ObjectId(OWNER_ID),
                role: 'USER',
                subscriptionTier: 'PRO',
            }) as never,
        );
        vi.mocked(Diagram.updateMany).mockReturnValue({
            exec: vi.fn().mockRejectedValue(new Error('reconciliation failed')),
        } as never);

        await expect(
            DiagramQuotaService.updateOwnerTier(OWNER_ID, 'FREE'),
        ).rejects.toThrow('reconciliation failed');

        expect(User.updateOne).not.toHaveBeenCalled();
    });

    it('maps exhausted named quota-slot conflicts to a stable quota error', async () => {
        vi.mocked(Diagram.countDocuments).mockReturnValue(chainable(0) as never);
        vi.mocked(Diagram.create).mockRejectedValue({
            code: 11000,
            message: 'duplicate key error index: uniq_diagram_owner_quota_slot',
        });

        await expect(
            DiagramQuotaService.createDiagram(OWNER_ID, 'USER', 'FREE', {
                name: 'Concurrent create',
                layout: {},
            }),
        ).rejects.toMatchObject({
            statusCode: 403,
            message: DIAGRAM_QUOTA_EXCEEDED,
        });
    });
});
