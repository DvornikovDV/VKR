import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../../config/env';
import { AppError } from './error.middleware';
import { type AuthTokenPayload } from '../../services/auth.service';
import { User } from '../../models/User';

// ── Augmented Request type ────────────────────────────────────────────────

export interface AuthRequest extends Request {
    user?: AuthTokenPayload;
}

// ── Middleware ────────────────────────────────────────────────────────────

/**
 * Validates the Bearer JWT in the Authorization header.
 * Attaches the decoded payload to `req.user` on success.
 * Responds with 401 if:
 *   - the token is missing, malformed, or expired;
 *   - the user account has been soft-deleted (isDeleted: true).
 */
export function authMiddleware(
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
): void {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next(new AppError('Authorization header missing or malformed', 401));
        return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
        next(new AppError('Bearer token is empty', 401));
        return;
    }

    let payload: AuthTokenPayload;
    try {
        payload = jwt.verify(token, ENV.JWT_SECRET) as AuthTokenPayload;
    } catch {
        next(new AppError('Invalid or expired token', 401));
        return;
    }

    // DB check: reject soft-deleted accounts even with a valid token (FR-11)
    User.findById(payload.userId)
        .lean()
        .then((user) => {
            if (!user || user.isDeleted || user.isBanned) {
                next(new AppError('Account has been deactivated or banned', 401));
                return;
            }
            req.user = payload;
            next();
        })
        .catch(() => {
            next(new AppError('Authentication check failed', 500));
        });
}
