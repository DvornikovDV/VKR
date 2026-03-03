import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './middlewares/auth.middleware';
import { UsersService } from '../services/users.service';
import { AppError } from './middlewares/error.middleware';

// ── Controller ────────────────────────────────────────────────────────────

/**
 * DELETE /api/users/me
 * Soft-deletes the authenticated user's own account.
 * Protected by authMiddleware — only the owner can delete themselves.
 * Returns 204 No Content on success.
 */
async function deleteMe(
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
): Promise<void> {
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

// ── Export ────────────────────────────────────────────────────────────────

export const UsersController = { deleteMe };
