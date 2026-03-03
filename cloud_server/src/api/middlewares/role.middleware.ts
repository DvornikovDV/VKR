import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './auth.middleware';
import { AppError } from './error.middleware';
import { type UserRole } from '../../models/User';

/**
 * Role-based access control middleware factory.
 * Must be used AFTER authMiddleware (requires req.user to be set).
 *
 * @param roles - One or more roles permitted to access the route.
 *
 * @example
 * router.delete('/admin/users/:id', authMiddleware, requireRole('ADMIN'), controller);
 */
export function requireRole(...roles: UserRole[]) {
    return (req: AuthRequest, _res: Response, next: NextFunction): void => {
        if (!req.user) {
            next(new AppError('Authentication required', 401));
            return;
        }

        if (!roles.includes(req.user.role as UserRole)) {
            next(new AppError('Insufficient permissions', 403));
            return;
        }

        next();
    };
}
