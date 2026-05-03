import { randomUUID } from 'node:crypto';

import mongoose from 'mongoose';

import { AppError } from '../api/middlewares/error.middleware';
import { CommandAudit } from '../models/CommandAudit';
import { EdgeServer } from '../models/EdgeServer';
import {
    cleanupPendingCommand,
    registerPendingCommand,
} from './command-pending-registry';
import { getActiveTrustedEdgeSocket } from '../socket/events/edge';
import type {
    CommandFailureReason,
    CommandRequest,
    CommandTerminalStatus,
} from '../types';

// ─── Non-terminal statuses that may still be advanced ────────────────────────

const NON_TERMINAL_STATUSES = ['accepted', 'sent_to_edge'] as const;
type NonTerminalStatus = (typeof NON_TERMINAL_STATUSES)[number];

// ─── T012: Command target access loading ─────────────────────────────────────

export interface CommandTarget {
    edgeId: mongoose.Types.ObjectId;
}

/**
 * Resolves and validates command routing target.
 *
 * Throws:
 *  - 400 if edgeId is not a valid ObjectId
 *  - 404 if the EdgeServer does not exist
 *  - 409 if the EdgeServer lifecycle state is not Active
 *  - 403 if the requesting user is not in EdgeServer.trustedUsers
 */
export async function loadCommandTarget(
    edgeIdStr: string,
    userIdStr: string,
): Promise<CommandTarget> {
    if (!mongoose.isValidObjectId(edgeIdStr)) {
        throw new AppError('Invalid edgeId', 400);
    }

    const edgeId = new mongoose.Types.ObjectId(edgeIdStr);

    const edgeServer = await EdgeServer.findById(edgeId)
        .select('lifecycleState trustedUsers')
        .lean<{
            lifecycleState: string | undefined;
            trustedUsers: mongoose.Types.ObjectId[];
        } | null>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    if (edgeServer.lifecycleState !== 'Active') {
        throw new AppError('Edge server is not Active', 409);
    }

    if (!mongoose.isValidObjectId(userIdStr)) {
        throw new AppError('Invalid userId', 400);
    }

    const userId = new mongoose.Types.ObjectId(userIdStr);
    const isTrusted = edgeServer.trustedUsers.some((uid) => uid.equals(userId));
    if (!isTrusted) {
        throw new AppError('Access denied: user is not trusted for this edge server', 403);
    }

    return { edgeId };
}

// ─── T013: Audit creation and non-terminal status helpers ────────────────────

export interface CreateAuditInput {
    requestId: string;
    edgeId: mongoose.Types.ObjectId;
    requestedBy: mongoose.Types.ObjectId;
    command: CommandRequest;
}

/**
 * Creates a CommandAudit record with initial status "accepted".
 * Returns the Mongoose document id.
 */
export async function createCommandAudit(input: CreateAuditInput): Promise<mongoose.Types.ObjectId> {
    const audit = await CommandAudit.create({
        requestId: input.requestId,
        edgeId: input.edgeId,
        deviceId: input.command.deviceId,
        commandType: input.command.commandType,
        payload: input.command.payload,
        requestedBy: input.requestedBy,
        status: 'accepted',
    });

    return audit._id;
}

/**
 * Transitions a CommandAudit from "accepted" to "sent_to_edge".
 *
 * Uses a non-terminal guard filter so this write is safe even if called
 * after the audit has already been closed as terminal (silently ignored).
 */
export async function markAuditSentToEdge(requestId: string): Promise<boolean> {
    const result = await CommandAudit.updateOne(
        { requestId, status: 'accepted' satisfies NonTerminalStatus },
        { $set: { status: 'sent_to_edge' satisfies NonTerminalStatus } },
    ).exec();

    return result.modifiedCount === 1;
}

// ─── T014: Atomic terminal audit update ──────────────────────────────────────

export interface TerminalAuditUpdate {
    requestId: string;
    status: CommandTerminalStatus;
    failureReason?: CommandFailureReason;
    completedAt: Date;
}

/**
 * Atomically transitions a CommandAudit to a terminal status.
 *
 * The Mongoose filter restricts the update to documents whose current status
 * is one of the non-terminal values ("accepted" | "sent_to_edge").
 * If the document is already terminal (timeout / failed / confirmed), the
 * filter does not match and modifiedCount === 0 — the caller receives false,
 * and no overwrite occurs.
 *
 * @returns true  — transition persisted successfully
 * @returns false — document was already in a terminal state (no-op; safe to ignore)
 */
export async function updateAuditTerminal(input: TerminalAuditUpdate): Promise<boolean> {
    const result = await CommandAudit.updateOne(
        {
            requestId: input.requestId,
            // Atomic guard: only match if still non-terminal
            status: { $in: NON_TERMINAL_STATUSES },
        },
        {
            $set: {
                status: input.status,
                completedAt: input.completedAt,
                ...(input.failureReason !== undefined
                    ? { failureReason: input.failureReason }
                    : {}),
            },
        },
    ).exec();

    return result.modifiedCount === 1;
}

// ─── T015: Command orchestration ─────────────────────────────────────────────

/** Timeout for cloud-side pending wait, in milliseconds. */
const CLOUD_RPC_TIMEOUT_MS = 5_000;

/**
 * Outcome returned by orchestrateCommand to the controller layer.
 * The controller maps these to HTTP status codes and response bodies.
 */
export type CommandOrchestratorOutcome =
    | { kind: 'confirmed'; requestId: string; completedAt: Date }
    | { kind: 'cloud_timeout'; requestId: string; completedAt: Date }
    | { kind: 'edge_timeout'; requestId: string; completedAt: Date }
    | { kind: 'edge_failed'; requestId: string; completedAt: Date; failureReason: CommandFailureReason }
    | { kind: 'edge_unavailable'; requestId: string; completedAt: Date };

/**
 * Orchestrates a Cloud-to-Edge command RPC with full audit lifecycle management.
 *
 * Lifecycle:
 *   accepted → (socket re-check) → sent_to_edge → confirmed | timeout | failed
 *
 * Timeout note: the 5-second cloud RPC timer starts only AFTER the audit is
 * marked sent_to_edge and execute_command has been emitted.
 *
 * If no active trusted Edge socket exists before emit, the audit is closed as
 * terminal failed (edge_unavailable) and the outcome is returned immediately
 * without emitting.
 */
export async function orchestrateCommand(
    target: CommandTarget,
    requestedBy: mongoose.Types.ObjectId,
    command: CommandRequest,
): Promise<CommandOrchestratorOutcome> {
    const requestId = randomUUID();
    const edgeIdStr = target.edgeId.toHexString();

    // --- Create audit record (accepted) before any socket interaction ---
    await createCommandAudit({ requestId, edgeId: target.edgeId, requestedBy, command });

    // --- Re-check the active trusted socket immediately before emit ---
    const socket = getActiveTrustedEdgeSocket(edgeIdStr);
    if (!socket) {
        // No trusted socket available — close audit as terminal failed
        const completedAt = new Date();
        await updateAuditTerminal({
            requestId,
            status: 'failed',
            failureReason: 'edge_unavailable',
            completedAt,
        });
        return { kind: 'edge_unavailable', requestId, completedAt };
    }

    // --- Register pending entry BEFORE emit so any early command_result is never dropped ---
    const registration = registerPendingCommand({
        requestId,
        edgeId: edgeIdStr,
        timeoutMs: CLOUD_RPC_TIMEOUT_MS,
    });

    // --- Emit execute_command; on unexpected throw, close audit and cleanup pending ---
    try {
        socket.emit('execute_command', {
            requestId,
            edgeId: edgeIdStr,
            deviceId: command.deviceId,
            commandType: command.commandType,
            payload: command.payload,
        });
    } catch (emitError) {
        cleanupPendingCommand(requestId);
        const completedAt = new Date();
        await updateAuditTerminal({
            requestId,
            status: 'failed',
            failureReason: 'edge_unavailable',
            completedAt,
        });
        console.error(`[commands] emit failed for ${requestId}:`, emitError);
        return { kind: 'edge_unavailable', requestId, completedAt };
    }

    // --- Mark audit sent_to_edge (timeout clock starts conceptually here) ---
    await markAuditSentToEdge(requestId);

    // --- Await the outcome (result or registry-side timeout) ---
    const outcome = await registration.promise;

    if (outcome.kind === 'timeout') {
        // T016: Cloud RPC timeout path — distinct from edge_command_timeout
        return handleCloudTimeout(outcome.requestId);
    }

    // T017: Edge result normalization
    return normalizeEdgeResult(outcome.result);
}

// ─── T016: Cloud timeout handling ────────────────────────────────────────────

/**
 * Handles the cloud-side RPC timeout.
 *
 * Atomically transitions the audit to terminal "timeout" with
 * failureReason "cloud_rpc_timeout". If the audit is already terminal
 * (race where the Edge result arrived just before the timer fired),
 * the conditional update is silently skipped.
 */
async function handleCloudTimeout(requestId: string): Promise<CommandOrchestratorOutcome> {
    const completedAt = new Date();
    await updateAuditTerminal({
        requestId,
        status: 'timeout',
        failureReason: 'cloud_rpc_timeout',
        completedAt,
    });
    return { kind: 'cloud_timeout', requestId, completedAt };
}

// ─── T017: Edge result normalization ─────────────────────────────────────────

/**
 * Normalizes a trusted CommandResult received from the Edge socket into a
 * terminal audit update and a typed CommandOrchestratorOutcome.
 *
 * Mapping:
 *   confirmed → confirmed            (no failureReason)
 *   timeout   → edge_timeout         (failureReason: "edge_command_timeout")
 *   failed    → edge_failed          (failureReason: forwarded from Edge, default "edge_command_failed")
 */
async function normalizeEdgeResult(result: {
    requestId: string;
    status: CommandTerminalStatus;
    failureReason?: CommandFailureReason;
    completedAt: string;
}): Promise<CommandOrchestratorOutcome> {
    const completedAt = new Date(result.completedAt);
    const { requestId, status } = result;

    if (status === 'confirmed') {
        await updateAuditTerminal({ requestId, status: 'confirmed', completedAt });
        return { kind: 'confirmed', requestId, completedAt };
    }

    if (status === 'timeout') {
        const failureReason: CommandFailureReason = 'edge_command_timeout';
        await updateAuditTerminal({ requestId, status: 'timeout', failureReason, completedAt });
        return { kind: 'edge_timeout', requestId, completedAt };
    }

    // status === 'failed'
    const failureReason: CommandFailureReason = result.failureReason ?? 'edge_command_failed';
    await updateAuditTerminal({ requestId, status: 'failed', failureReason, completedAt });
    return { kind: 'edge_failed', requestId, completedAt, failureReason };
}
