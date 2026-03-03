import { type Request, type Response, type NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AppError } from './middlewares/error.middleware';

// ── Helpers ───────────────────────────────────────────────────────────────

function assertBody(
    body: unknown,
    res: Response,
): body is { email: string; password: string } {
    if (
        typeof body !== 'object' ||
        body === null ||
        typeof (body as Record<string, unknown>)['email'] !== 'string' ||
        typeof (body as Record<string, unknown>)['password'] !== 'string'
    ) {
        res.status(400).json({ status: 'error', message: 'email and password are required strings' });
        return false;
    }
    return true;
}

// ── Handlers ──────────────────────────────────────────────────────────────

/**
 * POST /auth/register
 * Registers a new user. Returns 201 with JWT and user object.
 */
async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!assertBody(req.body, res)) return;
        const { email, password } = req.body as { email: string; password: string };

        if (!email.trim()) {
            throw new AppError('Email cannot be empty', 400);
        }

        const result = await AuthService.register(email.trim(), password);
        res.status(201).json({ status: 'success', data: result });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /auth/login
 * Authenticates a user. Returns 200 with JWT and user object.
 */
async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!assertBody(req.body, res)) return;
        const { email, password } = req.body as { email: string; password: string };

        const result = await AuthService.login(email.trim(), password);
        res.status(200).json({ status: 'success', data: result });
    } catch (err) {
        next(err);
    }
}

// ── Export ────────────────────────────────────────────────────────────────

export const AuthController = { register, login };
