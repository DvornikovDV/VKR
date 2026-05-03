import { type Response, type NextFunction } from 'express';
import { type AuthRequest } from './middlewares/auth.middleware';
import { AppError } from './middlewares/error.middleware';
import { loadCommandTarget, orchestrateCommand } from '../services/commands.service';
import { validateCommandRequestBody } from '../services/commands.validation';
import type { CommandOrchestratorOutcome } from '../services/commands.service';
import mongoose from 'mongoose';

// ─── Response shapes ──────────────────────────────────────────────────────────

interface CommandSuccessResponse {
    status: 'success';
    data: {
        requestId: string;
        commandStatus: 'confirmed';
        completedAt: string;
    };
}

interface CommandErrorResponse {
    status: 'error';
    message: string;
    requestId?: string;
    commandStatus?: string;
    failureReason?: string;
    completedAt?: string;
}

// ─── Outcome → HTTP mapping ───────────────────────────────────────────────────

/**
 * Maps a CommandOrchestratorOutcome to an Express response.
 *
 * Response shape for errors keeps failureReason / commandStatus at the top level
 * so test assertions and API consumers don't need to unwrap a nested data object.
 *
 * Mapping table (spec constraint: middleware owns 401 / 403 / 429):
 *   confirmed        → 200
 *   cloud_timeout    → 504 (Cloud RPC timeout)
 *   edge_timeout     → 502 (Edge timed out executing)
 *   edge_failed      → 502 (Edge reported failure)
 *   edge_unavailable → 503 (No trusted Edge socket online)
 */
function sendOutcome(res: Response, outcome: CommandOrchestratorOutcome): void {
    switch (outcome.kind) {
        case 'confirmed': {
            const body: CommandSuccessResponse = {
                status: 'success',
                data: {
                    requestId: outcome.requestId,
                    commandStatus: 'confirmed',
                    completedAt: outcome.completedAt.toISOString(),
                },
            };
            res.status(200).json(body);
            return;
        }

        case 'cloud_timeout': {
            const body: CommandErrorResponse = {
                status: 'error',
                message: 'Cloud RPC timeout: Edge did not respond within the allowed window',
                requestId: outcome.requestId,
                commandStatus: 'timeout',
                failureReason: 'cloud_rpc_timeout',
                completedAt: outcome.completedAt.toISOString(),
            };
            res.status(504).json(body);
            return;
        }

        case 'edge_timeout': {
            const body: CommandErrorResponse = {
                status: 'error',
                message: 'Edge command timeout: Edge accepted but did not complete execution',
                requestId: outcome.requestId,
                commandStatus: 'timeout',
                failureReason: 'edge_command_timeout',
                completedAt: outcome.completedAt.toISOString(),
            };
            res.status(502).json(body);
            return;
        }

        case 'edge_failed': {
            const body: CommandErrorResponse = {
                status: 'error',
                message: 'Edge command failed',
                requestId: outcome.requestId,
                commandStatus: 'failed',
                failureReason: outcome.failureReason,
                completedAt: outcome.completedAt.toISOString(),
            };
            res.status(502).json(body);
            return;
        }

        case 'edge_unavailable': {
            const body: CommandErrorResponse = {
                status: 'error',
                message: 'No active trusted Edge socket available for this Edge Server',
                requestId: outcome.requestId,
                commandStatus: 'failed',
                failureReason: 'edge_unavailable',
                completedAt: outcome.completedAt.toISOString(),
            };
            res.status(503).json(body);
            return;
        }
    }
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/edge-servers/:edgeId/commands
 *
 * Expects JWT auth + USER role to be enforced by preceding middleware.
 * 401 / 403 / 429 are owned by authMiddleware, requireRole, and commandRateLimit;
 * this controller maps only service outcomes and validation errors.
 */
async function executeCommand(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.user) {
            // Guard: middleware should have caught this; belt-and-suspenders only.
            throw new AppError('Authentication required', 401);
        }

        const edgeId = req.params['edgeId'] ?? '';
        const userId = req.user.userId;

        // 1. Validate request body — throws AppError(400) on failure
        const command = validateCommandRequestBody(req.body);

        // 2. Load and authorize command target — throws AppError(400|404|409|403)
        const target = await loadCommandTarget(edgeId, userId);

        // 3. Resolve userId as ObjectId for audit record
        const requestedBy = new mongoose.Types.ObjectId(userId);

        // 4. Run the full RPC orchestration
        const outcome = await orchestrateCommand(target, requestedBy, command);

        // 5. Map outcome to HTTP response (no throw; explicit branch per kind)
        sendOutcome(res, outcome);
    } catch (err) {
        next(err);
    }
}

export const CommandsController = {
    executeCommand,
};
