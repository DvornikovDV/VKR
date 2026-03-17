import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './middlewares/auth.middleware';
import { EdgeServersService, type EdgeCatalogEntry } from '../services/edge-servers.service';
import { AppError } from './middlewares/error.middleware';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Extracts and validates userId from req.user; throws 401 if missing. */
function requireUser(req: AuthRequest): { userId: string; role: string } {
    if (!req.user) {
        throw new AppError('Authentication required', 401);
    }
    return { userId: req.user.userId, role: req.user.role };
}

type EdgeCatalogSuccessResponse = {
    status: 'success';
    data: EdgeCatalogEntry[];
};

// ── Handlers ──────────────────────────────────────────────────────────────

/**
 * GET /api/edge-servers
 * USER only: returns edge servers where the user is in trustedUsers.
 * Admin fleet is served by GET /api/admin/edge-servers (AdminController).
 */
async function listEdgeServers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const servers = await EdgeServersService.listForUser(userId);
        res.status(200).json({ status: 'success', data: servers });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/edge-servers
 * ADMIN only: registers a new edge server.
 * Body: { name: string, apiKeyHash: string }
 */
async function registerEdgeServer(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const body = req.body as { name?: unknown; apiKeyHash?: unknown };

        if (typeof body.name !== 'string' || !body.name.trim()) {
            throw new AppError('name is required', 400);
        }
        if (typeof body.apiKeyHash !== 'string' || !body.apiKeyHash.trim()) {
            throw new AppError('apiKeyHash is required', 400);
        }

        const { userId: adminId } = requireUser(req);

        const edgeServer = await EdgeServersService.register(
            body.name.trim(),
            body.apiKeyHash.trim(),
            adminId,
        );
        res.status(201).json({ status: 'success', data: edgeServer });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/edge-servers/:edgeId/bind
 * ADMIN only: assigns a user to an edge server's trustedUsers.
 * Body: { userId: string }
 * Enforces FREE tier quota (FR-2b) inside the service.
 */
async function bindUserToEdge(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const edgeId = req.params['edgeId'] ?? '';
        const body = req.body as { userId?: unknown };

        if (typeof body.userId !== 'string' || !body.userId.trim()) {
            throw new AppError('userId is required', 400);
        }

        const edgeServer = await EdgeServersService.assignUserToEdge(edgeId, body.userId.trim());
        res.status(200).json({ status: 'success', data: edgeServer });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/edge-servers/:edgeId/bind/:userId
 * ADMIN only: removes a user from edge server's trustedUsers.
 */
async function unbindUserFromEdge(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const edgeId = req.params['edgeId'] ?? '';
        const targetUserId = req.params['userId'] ?? '';

        const edgeServer = await EdgeServersService.removeUserFromEdge(edgeId, targetUserId);
        res.status(200).json({ status: 'success', data: edgeServer });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/edge-servers/:edgeId/ping
 * ADMIN only: checks online state of edge server via in-memory lastSeen < 30s.
 * Returns { online: boolean, lastSeen: Date | null }.
 */
async function pingEdgeServer(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const edgeId = req.params['edgeId'] ?? '';
        const result = await EdgeServersService.pingEdgeServer(edgeId);
        res.status(200).json({ status: 'success', data: result });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/edge-servers/:edgeId/catalog
 * USER only: returns telemetry-derived catalog for a trusted edge server.
 */
async function getEdgeServerCatalog(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const edgeId = req.params['edgeId'] ?? '';
        const catalog = await EdgeServersService.getCatalogForUser(edgeId, userId);
        const payload: EdgeCatalogSuccessResponse = { status: 'success', data: catalog };
        res.status(200).json(payload);
    } catch (err) {
        next(err);
    }
}

// ── Export ────────────────────────────────────────────────────────────────

export const EdgeServersController = {
    listEdgeServers,
    registerEdgeServer,
    bindUserToEdge,
    unbindUserFromEdge,
    pingEdgeServer,
    getEdgeServerCatalog,
};
