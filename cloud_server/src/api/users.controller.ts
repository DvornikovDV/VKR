// Users controller — self-service endpoints
// Routes: DELETE /api/users/me, GET /api/users/me/stats, POST /api/users/me/password

import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './middlewares/auth.middleware';
import { UsersService } from '../services/users.service';
import { AppError } from './middlewares/error.middleware';

// ── DELETE /api/users/me ──────────────────────────────────────────────────

/**
 * DELETE /api/users/me
 * Soft-deletes the authenticated user's own account.
 * Protected by authMiddleware — only the owner can delete themselves.
 * Returns 204 No Content on success.
 */
async function deleteMe(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user) {
            next(new AppError('Unauthorized', 401));
            return;
        }

        await UsersService.deleteOwnAccount(req.user.userId);
        _res.status(204).end();
    } catch (err) {
        next(err);
    }
}

// ── GET /api/users/me/stats ───────────────────────────────────────────────

/**
 * GET /api/users/me/stats
 * Returns current usage statistics:
 *   - diagramCount: number of own diagrams
 *   - edgeServerCount: number of assigned edge servers
 * Used by the Profile page to display tier limit usage.
 */
async function getStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user) {
            next(new AppError('Unauthorized', 401));
            return;
        }

        const stats = await UsersService.getUserStats(req.user.userId);
        res.status(200).json({ status: 'success', data: stats });
    } catch (err) {
        next(err);
    }
}

// ── POST /api/users/me/password ───────────────────────────────────────────

/**
 * POST /api/users/me/password
 * Changes the authenticated user's password.
 * Body: { currentPassword: string, newPassword: string }
 * Validates currentPassword before updating.
 */
async function changePassword(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.user) {
            next(new AppError('Unauthorized', 401));
            return;
        }

        const body = req.body as { currentPassword?: unknown; newPassword?: unknown };

        if (typeof body.currentPassword !== 'string' || !body.currentPassword) {
            throw new AppError('currentPassword is required', 400);
        }
        if (typeof body.newPassword !== 'string' || !body.newPassword) {
            throw new AppError('newPassword is required', 400);
        }

        await UsersService.changePassword(
            req.user.userId,
            body.currentPassword,
            body.newPassword,
        );

        res.status(200).json({ status: 'success', message: 'Password changed successfully' });
    } catch (err) {
        next(err);
    }
}

// ── Export ────────────────────────────────────────────────────────────────

export const UsersController = { deleteMe, getStats, changePassword };
