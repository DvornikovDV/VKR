import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './middlewares/auth.middleware';
import { EdgeServersService, type EdgeCatalogEntry } from '../services/edge-servers.service';
import { EdgeOnboardingService } from '../services/edge-onboarding.service';
import { AppError } from './middlewares/error.middleware';
import { disconnectEdgeSocketsById } from '../socket/io';

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

type OnboardingActionSuccessPayload = {
    edge: unknown;
    onboardingPackage: unknown;
};

type LifecycleActionSuccessPayload = {
    edge: unknown;
    disconnectedSockets: number;
};

// ── Handlers ──────────────────────────────────────────────────────────────

/**
 * GET /api/edge-servers
 * USER only: returns telemetry-ready edge servers where the user is trusted.
 * Admin fleet is served by GET /api/admin/edge-servers (AdminController).
 */
async function listEdgeServers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const telemetryReadyEdges = await EdgeServersService.listForUser(userId);
        res.status(200).json({ status: 'success', data: telemetryReadyEdges });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/edge-servers
 * ADMIN only: registers a new edge server.
 * Body: { name: string }
 */
async function registerEdgeServer(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const body = req.body as { name?: unknown };

        if (typeof body.name !== 'string' || !body.name.trim()) {
            throw new AppError('name is required', 400);
        }

        const { userId: adminId } = requireUser(req);

        const result = await EdgeOnboardingService.registerEdgeServer(
            body.name.trim(),
            adminId,
        );
        const edge = await EdgeServersService.getAdminEdgeById(result.edge._id.toString());
        const payload: OnboardingActionSuccessPayload = {
            ...edge,
            edge,
            onboardingPackage: result.onboardingPackage,
        };
        res.status(201).json({ status: 'success', data: payload });
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

        await EdgeServersService.assignUserToEdge(edgeId, body.userId.trim());
        const edgeServer = await EdgeServersService.getAdminEdgeById(edgeId);
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

        await EdgeServersService.removeUserFromEdge(edgeId, targetUserId);
        const edgeServer = await EdgeServersService.getAdminEdgeById(edgeId);
        res.status(200).json({ status: 'success', data: edgeServer });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/edge-servers/:edgeId/ping
 * ADMIN only: checks online state of edge server via in-memory lastSeenAt < 30s.
 * Returns { online: boolean, lastSeenAt: Date | null }.
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
 * USER only: returns telemetry-derived catalog for a trusted Active edge server.
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

function requireEdgeId(req: AuthRequest): string {
    const edgeId = typeof req.params['edgeId'] === 'string' ? req.params['edgeId'].trim() : '';
    if (!edgeId) {
        throw new AppError('edgeId is required', 400);
    }
    return edgeId;
}

async function resetOnboardingCredentials(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId: adminId } = requireUser(req);
        const edgeId = requireEdgeId(req);
        const result = await EdgeOnboardingService.resetOnboardingCredentials(edgeId, adminId);
        const edge = await EdgeServersService.getAdminEdgeById(edgeId);
        const payload: OnboardingActionSuccessPayload = {
            ...edge,
            edge,
            onboardingPackage: result.onboardingPackage,
        };
        res.status(200).json({ status: 'success', data: payload });
    } catch (err) {
        next(err);
    }
}

async function revokeEdgeTrust(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId: adminId } = requireUser(req);
        const edgeId = requireEdgeId(req);
        await EdgeOnboardingService.revokeEdgeTrust(edgeId, adminId);
        const disconnectedSockets = await disconnectEdgeSocketsById(edgeId, 'trust_revoked');
        const payload: LifecycleActionSuccessPayload = {
            edge: await EdgeServersService.getAdminEdgeById(edgeId),
            disconnectedSockets,
        };
        res.status(200).json({ status: 'success', data: payload.edge });
    } catch (err) {
        next(err);
    }
}

async function blockEdgeServer(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId: adminId } = requireUser(req);
        const edgeId = requireEdgeId(req);
        await EdgeOnboardingService.blockEdgeServer(edgeId, adminId);
        const disconnectedSockets = await disconnectEdgeSocketsById(edgeId, 'blocked');
        const payload: LifecycleActionSuccessPayload = {
            edge: await EdgeServersService.getAdminEdgeById(edgeId),
            disconnectedSockets,
        };
        res.status(200).json({ status: 'success', data: payload.edge });
    } catch (err) {
        next(err);
    }
}

async function reenableEdgeOnboarding(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId: adminId } = requireUser(req);
        const edgeId = requireEdgeId(req);
        await EdgeOnboardingService.reenableEdgeOnboarding(edgeId, adminId);
        const edge = await EdgeServersService.getAdminEdgeById(edgeId);
        res.status(200).json({ status: 'success', data: edge });
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
    resetOnboardingCredentials,
    revokeEdgeTrust,
    blockEdgeServer,
    reenableEdgeOnboarding,
};
