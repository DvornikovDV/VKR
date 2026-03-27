// T045 — Admin-only API controller
// Routes: GET /api/admin/users, PATCH /api/admin/users/:id/tier,
//          PATCH /api/admin/users/:id/status, GET /api/admin/edge-servers
//
// All routes MUST be protected by both authMiddleware and requireRole('ADMIN').

import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './middlewares/auth.middleware';
import { UsersService } from '../services/users.service';
import {
    EdgeServersService,
    mapEdgeToAdminProjection,
    type AdminEdgeProjection,
} from '../services/edge-servers.service';
import { AppError } from './middlewares/error.middleware';
import type { SubscriptionTier } from '../models/User';

// ── GET /api/admin/users ──────────────────────────────────────────────────

/**
 * Returns a paginated list of all Users.
 * Optional query params: page, limit, search (substring match on email).
 */
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

// ── PATCH /api/admin/users/:id/tier ───────────────────────────────────────

/**
 * Updates a user's subscription tier.
 * Body: { tier: 'FREE' | 'PRO' }
 */
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

// ── PATCH /api/admin/users/:id/status ─────────────────────────────────────

/**
 * Bans or unbans a user account.
 * Body: { isBanned: boolean }
 */
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

// ── GET /api/admin/edge-servers ───────────────────────────────────────────

/**
 * Returns the global Edge Server fleet with populated trustedUsers and createdBy.
 * Excludes apiKeyHash from the response.
 */
async function listGlobalEdgeServers(
    _req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const servers = await EdgeServersService.listAllForAdmin();
        const payload: AdminEdgeProjection[] = (servers as Array<Parameters<typeof mapEdgeToAdminProjection>[0]>).map(
            mapEdgeToAdminProjection,
        );
        res.status(200).json({ status: 'success', data: payload });
    } catch (err) {
        next(err);
    }
}

// ── Export ────────────────────────────────────────────────────────────────

export const AdminController = {
    listUsers,
    updateUserTier,
    updateUserStatus,
    listGlobalEdgeServers,
};
