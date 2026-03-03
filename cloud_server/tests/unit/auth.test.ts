/**
 * Unit tests for AuthService.
 * All external dependencies (MongoDB User model, bcrypt, jsonwebtoken) are mocked.
 * Tests focus on business logic: validation, error codes, token generation flow.
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';

// ── Mock ENV (must come BEFORE service imports) ───────────────────────────
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

// ── Mock User model ───────────────────────────────────────────────────────
vi.mock('../../src/models/User', () => ({
    User: {
        findOne: vi.fn(),
        create: vi.fn(),
    },
}));

// ── Mock bcrypt ───────────────────────────────────────────────────────────
vi.mock('bcrypt', () => ({
    default: {
        hash: vi.fn(),
        compare: vi.fn(),
    },
}));

// ── Mock jsonwebtoken ─────────────────────────────────────────────────────
vi.mock('jsonwebtoken', () => ({
    default: {
        sign: vi.fn(),
        verify: vi.fn(),
    },
}));

// ── Imports after mocks ───────────────────────────────────────────────────
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/services/auth.service';
import { AppError } from '../../src/api/middlewares/error.middleware';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeUser(overrides: Record<string, unknown> = {}) {
    return {
        _id: { toString: () => 'user_id_123' },
        email: 'test@example.com',
        passwordHash: '$bcrypt$hash',
        role: 'USER',
        subscriptionTier: 'FREE',
        isDeleted: false,
        ...overrides,
    };
}

// ── Test Suites ───────────────────────────────────────────────────────────

describe('AuthService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── register ────────────────────────────────────────────────────────────

    describe('register()', () => {
        it('should return token and user on successful registration', async () => {
            const mockUser = makeUser();
            vi.mocked(User.findOne).mockResolvedValue(null);
            vi.mocked(bcrypt.hash).mockResolvedValue('hashed_pw' as never);
            vi.mocked(User.create).mockResolvedValue(mockUser as never);
            vi.mocked(jwt.sign).mockReturnValue('signed_token' as never);

            const result = await AuthService.register('test@example.com', 'password123');

            expect(result.token).toBe('signed_token');
            expect(result.user).toMatchObject({ email: 'test@example.com' });
            expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
            expect(jwt.sign).toHaveBeenCalledOnce();
        });

        it('should normalise email to lowercase before saving', async () => {
            const mockUser = makeUser({ email: 'upper@example.com' });
            vi.mocked(User.findOne).mockResolvedValue(null);
            vi.mocked(bcrypt.hash).mockResolvedValue('h' as never);
            vi.mocked(User.create).mockResolvedValue(mockUser as never);
            vi.mocked(jwt.sign).mockReturnValue('tok' as never);

            await AuthService.register('UPPER@EXAMPLE.COM', 'password123');

            expect(User.findOne).toHaveBeenCalledWith({ email: 'upper@example.com' });
            expect(User.create).toHaveBeenCalledWith(
                expect.objectContaining({ email: 'upper@example.com' }),
            );
        });

        it('should throw 409 if email is already registered', async () => {
            vi.mocked(User.findOne).mockResolvedValue(makeUser() as never);

            await expect(
                AuthService.register('test@example.com', 'password123'),
            ).rejects.toMatchObject({ statusCode: 409, message: 'Email already registered' });

            expect(User.create).not.toHaveBeenCalled();
        });

        it('should throw 400 if password is shorter than 8 characters', async () => {
            await expect(
                AuthService.register('test@example.com', 'short'),
            ).rejects.toMatchObject({ statusCode: 400 });

            expect(User.findOne).not.toHaveBeenCalled();
            expect(User.create).not.toHaveBeenCalled();
        });

        it('should throw an AppError instance on 409', async () => {
            vi.mocked(User.findOne).mockResolvedValue(makeUser() as never);

            const err = await AuthService.register('x@x.com', 'password123').catch(e => e);
            expect(err).toBeInstanceOf(AppError);
            expect((err as AppError).isOperational).toBe(true);
        });
    });

    // ── login ────────────────────────────────────────────────────────────────

    describe('login()', () => {
        it('should return token and user on valid credentials', async () => {
            const mockUser = makeUser();
            vi.mocked(User.findOne).mockResolvedValue(mockUser as never);
            vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
            vi.mocked(jwt.sign).mockReturnValue('login_token' as never);

            const result = await AuthService.login('test@example.com', 'password123');

            expect(result.token).toBe('login_token');
            expect(result.user).toMatchObject({ email: 'test@example.com' });
        });

        it('should throw 401 if user is not found', async () => {
            vi.mocked(User.findOne).mockResolvedValue(null);

            await expect(
                AuthService.login('ghost@example.com', 'password123'),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid credentials' });
        });

        it('should throw 401 if password does not match', async () => {
            vi.mocked(User.findOne).mockResolvedValue(makeUser() as never);
            vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

            await expect(
                AuthService.login('test@example.com', 'wrongpassword'),
            ).rejects.toMatchObject({ statusCode: 401, message: 'Invalid credentials' });

            expect(jwt.sign).not.toHaveBeenCalled();
        });

        it('should not reveal whether email exists (same error for both cases)', async () => {
            // Case 1: email not found
            vi.mocked(User.findOne).mockResolvedValue(null);
            const err1 = await AuthService.login('x@x.com', 'pw12345678').catch(e => e) as AppError;

            vi.clearAllMocks();

            // Case 2: wrong password
            vi.mocked(User.findOne).mockResolvedValue(makeUser() as never);
            vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
            const err2 = await AuthService.login('x@x.com', 'wrongpass').catch(e => e) as AppError;

            expect(err1.message).toBe(err2.message);
            expect(err1.statusCode).toBe(err2.statusCode);
        });

        it('should filter out soft-deleted users', async () => {
            // findOne is called with isDeleted: { $ne: true }
            vi.mocked(User.findOne).mockResolvedValue(null);

            await expect(
                AuthService.login('deleted@example.com', 'password123'),
            ).rejects.toMatchObject({ statusCode: 401 });

            const callArg = (vi.mocked(User.findOne) as MockInstance).mock.calls[0][0];
            expect(callArg).toMatchObject({ isDeleted: { $ne: true } });
        });
    });

    // ── AppError ─────────────────────────────────────────────────────────────

    describe('AppError', () => {
        it('should construct with correct statusCode and isOperational flag', () => {
            const err = new AppError('Not found', 404);
            expect(err.statusCode).toBe(404);
            expect(err.isOperational).toBe(true);
            expect(err.message).toBe('Not found');
            expect(err).toBeInstanceOf(Error);
        });

        it('should default statusCode to 500', () => {
            const err = new AppError('Oops');
            expect(err.statusCode).toBe(500);
        });
    });
});
