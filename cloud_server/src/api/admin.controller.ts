// T045 — Admin-only API controller
// Routes: GET /api/admin/users, PATCH /api/admin/users/:id/tier,
//         PATCH /api/admin/users/:id/status, GET /api/admin/edge-servers
//
// All routes MUST be protected by both authMiddleware and requireRole('ADMIN').

import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './middlewares/auth.middleware';
import { UsersService } from '../services/users.service';
import { EdgeServersService } from '../services/edge-servers.service';
import { AppError } from './middlewares/error.middleware';
import type { SubscriptionTier } from '../models/User';
import type { AdminEdgeServerRecord } from '../types';

async function listUsers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const page = parseInt(String(req.query['page'] ?? '1'), 10) || 1;
        const limit = parseInt(String(req.query['limit'] ?? '20'), 10) || 20;
        const search = typeof req.query['search'] === 'string' ? req.query['search'] : undefined;

        const result = await UsersService.listUsers({ page, limit, search });
        res.status(200).json({ status: 'success', ...result });
    } catch (err) {
        next(err);
    }
}

async function updateUserTier(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const targetId = req.params['id'] ?? '';
        const body = req.body as { tier?: unknown };

        if (body.tier !== 'FREE' && body.tier !== 'PRO') {
            throw new AppError("tier must be 'FREE' or 'PRO'", 400);
        }

        await UsersService.updateUserTier(targetId, body.tier as SubscriptionTier);
        res.status(200).json({ status: 'success', message: 'Tier updated' });
    } catch (err) {
        next(err);
    }
}

async function updateUserStatus(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const targetId = req.params['id'] ?? '';
        const body = req.body as { isBanned?: unknown };

        if (typeof body.isBanned !== 'boolean') {
            throw new AppError('isBanned must be a boolean', 400);
        }

        await UsersService.updateUserStatus(targetId, body.isBanned);
        res.status(200).json({
            status: 'success',
            message: body.isBanned ? 'User banned' : 'User unbanned',
        });
    } catch (err) {
        next(err);
    }
}

async function listGlobalEdgeServers(
    _req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const fleetProjection: AdminEdgeServerRecord[] = await EdgeServersService.listAllForAdmin();
        res.status(200).json({ status: 'success', data: fleetProjection });
    } catch (err) {
        next(err);
    }
}

export const AdminController = {
    listUsers,
    updateUserTier,
    updateUserStatus,
    listGlobalEdgeServers,
};
