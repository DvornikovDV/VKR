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

// ── Imports after mocks ────────────────────────────────────────────────────
import { Diagram } from '../../src/models/Diagram';
import { DiagramBindings } from '../../src/models/DiagramBindings';
import { DiagramsService, FREE_DIAGRAM_QUOTA } from '../../src/services/diagrams.service';
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

// ── Test Suites ───────────────────────────────────────────────────────────

describe('DiagramsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Quota enforcement ────────────────────────────────────────────────────

    describe('create() — FREE tier quota', () => {
        it('should allow creation when user has fewer than 3 diagrams', async () => {
            vi.mocked(Diagram.countDocuments).mockReturnValue(chainable(2) as never);
            const created = makeDiagram({ name: 'New Diagram' });
            vi.mocked(Diagram.create).mockResolvedValue(created as never);

            const result = await DiagramsService.create(OWNER_ID, 'FREE', {
                name: 'New Diagram',
                layout: {},
            });

            expect(result.name).toBe('New Diagram');
            expect(Diagram.create).toHaveBeenCalledOnce();
        });

        it(`should throw 403 when FREE user already has ${FREE_DIAGRAM_QUOTA} diagrams`, async () => {
            vi.mocked(Diagram.countDocuments).mockReturnValue(
                chainable(FREE_DIAGRAM_QUOTA) as never,
            );

            await expect(
                DiagramsService.create(OWNER_ID, 'FREE', { name: 'Extra', layout: {} }),
            ).rejects.toMatchObject({
                statusCode: 403,
                message: expect.stringContaining('quota'),
            });

            expect(Diagram.create).not.toHaveBeenCalled();
        });

        it('should not enforce quota for PRO users', async () => {
            const created = makeDiagram();
            vi.mocked(Diagram.create).mockResolvedValue(created as never);

            // countDocuments should NOT be called for PRO
            await DiagramsService.create(OWNER_ID, 'PRO', { name: 'Pro Diagram', layout: {} });

            expect(Diagram.countDocuments).not.toHaveBeenCalled();
            expect(Diagram.create).toHaveBeenCalledOnce();
        });

        it('should enforce quota at exactly FREE_DIAGRAM_QUOTA (boundary)', async () => {
            vi.mocked(Diagram.countDocuments).mockReturnValue(chainable(3) as never);

            await expect(
                DiagramsService.create(OWNER_ID, 'FREE', { name: 'Over quota', layout: {} }),
            ).rejects.toMatchObject({ statusCode: 403 });
        });

        it('should allow the last FREE slot (count = 2, quota = 3)', async () => {
            vi.mocked(Diagram.countDocuments).mockReturnValue(chainable(2) as never);
            const created = makeDiagram();
            vi.mocked(Diagram.create).mockResolvedValue(created as never);

            await expect(
                DiagramsService.create(OWNER_ID, 'FREE', { name: 'Third diagram', layout: {} }),
            ).resolves.not.toThrow();
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

            await DiagramsService.hardDelete(DIAGRAM_ID, OWNER_ID);

            expect(DiagramBindings.deleteMany).toHaveBeenCalledOnce();
        });

        it('should throw 404 if diagram not found', async () => {
            vi.mocked(Diagram.findOneAndDelete).mockReturnValue(chainable(null) as never);

            await expect(DiagramsService.hardDelete(DIAGRAM_ID, OWNER_ID)).rejects.toMatchObject({
                statusCode: 404,
            });

            expect(DiagramBindings.deleteMany).not.toHaveBeenCalled();
        });
    });

    // ── AppError type check ──────────────────────────────────────────────────

    describe('error types', () => {
        it('quota violation should be AppError instance', async () => {
            vi.mocked(Diagram.countDocuments).mockReturnValue(chainable(3) as never);

            const err = await DiagramsService.create(OWNER_ID, 'FREE', {
                name: 'Over',
                layout: {},
            }).catch((e) => e);

            expect(err).toBeInstanceOf(AppError);
            expect(err.isOperational).toBe(true);
        });
    });
});
