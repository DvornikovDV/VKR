import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './middlewares/auth.middleware';
import { EdgeServersService, type EdgeCatalogEntry } from '../services/edge-servers.service';
import { AppError } from './middlewares/error.middleware';
import { disconnectEdgeSocketsById } from '../socket/io';
import type {
    AdminEdgeServerRecord,
    EdgeCredentialIssueData,
    EdgeStatusRecord,
    UserEdgeServerRecord,
} from '../types';

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

type EdgeListSuccessResponse = {
    status: 'success';
    data: UserEdgeServerRecord[];
};

type EdgeBindSuccessResponse = {
    status: 'success';
    data: AdminEdgeServerRecord;
};

type AdminEdgeFleetSuccessResponse = {
    status: 'success';
    data: AdminEdgeServerRecord[];
};

type EdgeCredentialIssueResponse = {
    status: 'success';
    data: EdgeCredentialIssueData;
};

type EdgeStatusSuccessResponse = {
    status: 'success';
    data: EdgeStatusRecord;
};

type EdgeBlockSuccessResponse = {
    status: 'success';
    data: {
        edge: AdminEdgeServerRecord;
    };
};

async function listEdgeServers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const userEdges = await EdgeServersService.listForUser(userId);
        const payload: EdgeListSuccessResponse = { status: 'success', data: userEdges };
        res.status(200).json(payload);
    } catch (err) {
        next(err);
    }
}

async function listAdminEdgeServers(
    _req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const fleetProjection = await EdgeServersService.listAllForAdmin();
        const payload: AdminEdgeFleetSuccessResponse = {
            status: 'success',
            data: fleetProjection,
        };
        res.status(200).json(payload);
    } catch (err) {
        next(err);
    }
}

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
        const result = await EdgeServersService.registerEdgeServer(body.name.trim(), adminId);
        const payload: EdgeCredentialIssueResponse = { status: 'success', data: result };
        res.status(201).json(payload);
    } catch (err) {
        next(err);
    }
}

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
        const payload: EdgeBindSuccessResponse = { status: 'success', data: edgeServer };
        res.status(200).json(payload);
    } catch (err) {
        next(err);
    }
}

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
        const payload: EdgeBindSuccessResponse = { status: 'success', data: edgeServer };
        res.status(200).json(payload);
    } catch (err) {
        next(err);
    }
}

async function pingEdgeServer(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const edgeId = requireEdgeId(req);
        const result = await EdgeServersService.pingEdgeServer(edgeId);
        const payload: EdgeStatusSuccessResponse = { status: 'success', data: result };
        res.status(200).json(payload);
    } catch (err) {
        next(err);
    }
}

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

async function rotateEdgeCredential(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId: adminId } = requireUser(req);
        const edgeId = requireEdgeId(req);
        const result = await EdgeServersService.rotateEdgeCredential(edgeId, adminId);
        await disconnectEdgeSocketsById(edgeId, 'credential_rotated');
        const payload: EdgeCredentialIssueResponse = {
            status: 'success',
            data: {
                ...result,
                edge: await EdgeServersService.getAdminEdgeById(edgeId),
            },
        };
        res.status(200).json(payload);
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
        await EdgeServersService.blockEdgeServer(edgeId, adminId);
        await disconnectEdgeSocketsById(edgeId, 'blocked');
        const edge = await EdgeServersService.getAdminEdgeById(edgeId);
        const payload: EdgeBlockSuccessResponse = { status: 'success', data: { edge } };
        res.status(200).json(payload);
    } catch (err) {
        next(err);
    }
}

async function unblockEdgeServer(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { userId: adminId } = requireUser(req);
        const edgeId = requireEdgeId(req);
        const result = await EdgeServersService.unblockEdgeServer(edgeId, adminId);
        const payload: EdgeCredentialIssueResponse = { status: 'success', data: result };
        res.status(200).json(payload);
    } catch (err) {
        next(err);
    }
}

export const EdgeServersController = {
    listEdgeServers,
    listAdminEdgeServers,
    registerEdgeServer,
    bindUserToEdge,
    unbindUserFromEdge,
    pingEdgeServer,
    getEdgeServerCatalog,
    rotateEdgeCredential,
    blockEdgeServer,
    unblockEdgeServer,
};
