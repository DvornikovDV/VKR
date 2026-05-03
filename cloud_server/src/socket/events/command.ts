import { type Socket } from 'socket.io';

import {
    getPendingCommandEdgeId,
    resolvePendingCommandResult,
} from '../../services/command-pending-registry';
import type { CommandFailureReason, CommandResult, CommandTerminalStatus } from '../../types';
import { isTrustedEdgeSocket } from './edge-runtime-session';

type EdgeCommandFailureReason = Extract<CommandFailureReason, 'edge_command_timeout' | 'edge_command_failed'>;

const TERMINAL_STATUSES = ['confirmed', 'timeout', 'failed'] as const satisfies readonly CommandTerminalStatus[];
const EDGE_FAILURE_REASONS = [
    'edge_command_timeout',
    'edge_command_failed',
] as const satisfies readonly EdgeCommandFailureReason[];

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function isTerminalStatus(value: unknown): value is CommandTerminalStatus {
    return typeof value === 'string' && TERMINAL_STATUSES.includes(value as CommandTerminalStatus);
}

function isEdgeFailureReason(value: unknown): value is EdgeCommandFailureReason {
    return typeof value === 'string' && EDGE_FAILURE_REASONS.includes(value as EdgeCommandFailureReason);
}

function readCompletedAt(value: unknown): string | null {
    const completedAt = readNonEmptyString(value);
    if (!completedAt) {
        return null;
    }

    return Number.isNaN(Date.parse(completedAt)) ? null : completedAt;
}

function normalizeCommandResultPayload(edgeId: string, payload: unknown): CommandResult | null {
    if (!isRecord(payload)) {
        return null;
    }

    const payloadEdgeId = readNonEmptyString(payload['edgeId']);
    if (payloadEdgeId !== edgeId) {
        return null;
    }

    const requestId = readNonEmptyString(payload['requestId']);
    if (!requestId || getPendingCommandEdgeId(requestId) !== edgeId) {
        return null;
    }

    const status = payload['status'];
    if (!isTerminalStatus(status)) {
        return null;
    }

    const completedAt = readCompletedAt(payload['completedAt']);
    if (!completedAt) {
        return null;
    }

    if (status === 'confirmed') {
        if (payload['failureReason'] !== undefined && payload['failureReason'] !== null) {
            return null;
        }

        return {
            requestId,
            status,
            completedAt,
        };
    }

    const failureReason = payload['failureReason'];
    if (!isEdgeFailureReason(failureReason)) {
        return null;
    }

    if (status === 'timeout' && failureReason !== 'edge_command_timeout') {
        return null;
    }

    if (status === 'failed' && failureReason !== 'edge_command_failed') {
        return null;
    }

    return {
        requestId,
        status,
        failureReason,
        completedAt,
    };
}

export function registerCommandResultHandler(socket: Socket, edgeId: string): void {
    socket.on('command_result', (payload: unknown) => {
        if (!isTrustedEdgeSocket(socket, edgeId)) {
            console.warn(`[command] Ignored result from untrusted edge session ${edgeId}`);
            return;
        }

        const result = normalizeCommandResultPayload(edgeId, payload);
        if (!result) {
            console.warn(`[command] Ignored invalid command_result from edge ${edgeId}`);
            return;
        }

        const resolved = resolvePendingCommandResult(edgeId, result);
        if (resolved !== 'resolved') {
            console.warn(`[command] Ignored command_result for ${result.requestId}: ${resolved}`);
        }
    });
}
