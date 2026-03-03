import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './middlewares/auth.middleware';
import { DiagramsService } from '../services/diagrams.service';
import { DiagramBindingsService } from '../services/diagram-bindings.service';
import { AppError } from './middlewares/error.middleware';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Extracts and validates userId from req.user; throws 401 if missing. */
function requireUser(req: AuthRequest): { userId: string; subscriptionTier: string; role: string } {
    if (!req.user) {
        throw new AppError('Authentication required', 401);
    }
    return {
        userId: req.user.userId,
        subscriptionTier: req.user.subscriptionTier ?? 'FREE',
        role: req.user.role,
    };
}

// ── Diagram Handlers ──────────────────────────────────────────────────────

/**
 * GET /api/diagrams
 * Returns all diagrams owned by the authenticated user.
 */
async function listDiagrams(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const diagrams = await DiagramsService.listOwned(userId);
        res.status(200).json({ status: 'success', data: diagrams });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/diagrams
 * Creates a new diagram ("Save As"). Enforces FREE tier quota (3).
 */
async function createDiagram(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId, subscriptionTier } = requireUser(req);
        const body = req.body as { name?: unknown; layout?: unknown };

        if (typeof body.name !== 'string' || !body.name.trim()) {
            throw new AppError('name is required', 400);
        }
        if (typeof body.layout !== 'object' || body.layout === null || Array.isArray(body.layout)) {
            throw new AppError('layout must be a plain object', 400);
        }

        const diagram = await DiagramsService.create(userId, subscriptionTier, {
            name: body.name.trim(),
            layout: body.layout as Record<string, unknown>,
        });

        res.status(201).json({ status: 'success', data: diagram });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/diagrams/:id
 * Returns a single diagram by ID (owner only).
 */
async function getDiagram(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const diagram = await DiagramsService.getById(req.params['id'] ?? '', userId);
        res.status(200).json({ status: 'success', data: diagram });
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /api/diagrams/:id
 * Replaces layout/name in-place using OCC (__v required in body).
 * Response includes bindingsInvalidated flag.
 */
async function updateDiagram(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const body = req.body as { name?: unknown; layout?: unknown; __v?: unknown };

        if (typeof body.__v !== 'number') {
            throw new AppError('__v (version key) is required as a number', 400);
        }

        const { diagram, bindingsInvalidated } = await DiagramsService.update(
            req.params['id'] ?? '',
            userId,
            {
                name: typeof body.name === 'string' ? body.name : undefined,
                layout:
                    typeof body.layout === 'object' &&
                        body.layout !== null &&
                        !Array.isArray(body.layout)
                        ? (body.layout as Record<string, unknown>)
                        : undefined,
                __v: body.__v,
            },
        );

        res.status(200).json({ status: 'success', data: diagram, bindingsInvalidated });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/diagrams/:id
 * Hard-deletes a diagram and all its DiagramBindings (cascade).
 */
async function deleteDiagram(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        await DiagramsService.hardDelete(req.params['id'] ?? '', userId);
        res.status(204).send();
    } catch (err) {
        next(err);
    }
}

// ── DiagramBindings Handlers ──────────────────────────────────────────────

/**
 * GET /api/diagrams/:id/bindings
 * Returns all binding sets for the diagram.
 */
async function listBindings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const bindings = await DiagramBindingsService.listForDiagram(
            req.params['id'] ?? '',
            userId,
        );
        res.status(200).json({ status: 'success', data: bindings });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/diagrams/:id/bindings
 * Creates or replaces a DiagramBindings set for a given edgeServerId.
 * 201 = created; 200 = replaced.
 */
async function upsertBindings(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const body = req.body as { edgeServerId?: unknown; widgetBindings?: unknown };

        if (typeof body.edgeServerId !== 'string' || !body.edgeServerId.trim()) {
            throw new AppError('edgeServerId is required', 400);
        }
        if (!Array.isArray(body.widgetBindings)) {
            throw new AppError('widgetBindings must be an array', 400);
        }

        const { binding, created } = await DiagramBindingsService.upsert(
            req.params['id'] ?? '',
            userId,
            {
                edgeServerId: body.edgeServerId,
                widgetBindings: body.widgetBindings as {
                    widgetId: string;
                    deviceId: string;
                    metric: string;
                }[],
            },
        );

        res.status(created ? 201 : 200).json({ status: 'success', data: binding });
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /api/diagrams/:id/bindings/:edgeServerId
 * Deletes a specific binding set.
 */
async function deleteBinding(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        await DiagramBindingsService.remove(
            req.params['id'] ?? '',
            userId,
            req.params['edgeServerId'] ?? '',
        );
        res.status(204).send();
    } catch (err) {
        next(err);
    }
}

// ── Admin: Diagram Assignment ─────────────────────────────────────────────

/**
 * POST /api/diagrams/:id/assign
 * Admin-only: transfers ownership of the diagram to targetUserId.
 * DiagramBindings are NOT transferred to the new owner.
 * Returns 403 if the Admin does not own the diagram.
 */
async function assignDiagram(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = requireUser(req);
        const body = req.body as { targetUserId?: unknown };

        if (typeof body.targetUserId !== 'string' || !body.targetUserId.trim()) {
            throw new AppError('targetUserId is required', 400);
        }

        const diagram = await DiagramsService.assignDiagram(
            userId,
            req.params['id'] ?? '',
            body.targetUserId.trim(),
        );

        res.status(200).json({ status: 'success', data: diagram });
    } catch (err) {
        next(err);
    }
}

// ── Export ────────────────────────────────────────────────────────────────

export const DiagramsController = {
    listDiagrams,
    createDiagram,
    getDiagram,
    updateDiagram,
    deleteDiagram,
    listBindings,
    upsertBindings,
    deleteBinding,
    assignDiagram,
};
