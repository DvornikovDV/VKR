import type { CommandResult } from '../types';

export type PendingCommandOutcome =
    | {
        kind: 'result';
        result: CommandResult;
    }
    | {
        kind: 'timeout';
        requestId: string;
        edgeId: string;
        completedAt: string;
    };

export type ResolvePendingCommandResult =
    | 'resolved'
    | 'ignored_unknown_request'
    | 'ignored_edge_mismatch';

export interface PendingCommandRegistration {
    requestId: string;
    edgeId: string;
    promise: Promise<PendingCommandOutcome>;
}

interface PendingCommandEntry {
    edgeId: string;
    timer: NodeJS.Timeout;
    resolve: (outcome: PendingCommandOutcome) => void;
}

const pendingCommands = new Map<string, PendingCommandEntry>();

function completePendingCommand(requestId: string, outcome: PendingCommandOutcome): boolean {
    const entry = pendingCommands.get(requestId);
    if (!entry) {
        return false;
    }

    pendingCommands.delete(requestId);
    clearTimeout(entry.timer);
    entry.resolve(outcome);
    return true;
}

export function registerPendingCommand(input: {
    requestId: string;
    edgeId: string;
    timeoutMs: number;
}): PendingCommandRegistration {
    if (pendingCommands.has(input.requestId)) {
        throw new Error(`Pending command already registered: ${input.requestId}`);
    }

    let resolveOutcome: (outcome: PendingCommandOutcome) => void = () => undefined;
    const promise = new Promise<PendingCommandOutcome>((resolve) => {
        resolveOutcome = resolve;
    });

    const timer = setTimeout(() => {
        timeoutPendingCommand(input.requestId);
    }, input.timeoutMs);

    pendingCommands.set(input.requestId, {
        edgeId: input.edgeId,
        timer,
        resolve: resolveOutcome,
    });

    return {
        requestId: input.requestId,
        edgeId: input.edgeId,
        promise,
    };
}

export function getPendingCommandEdgeId(requestId: string): string | null {
    return pendingCommands.get(requestId)?.edgeId ?? null;
}

export function getPendingCommandCount(): number {
    return pendingCommands.size;
}

export function resolvePendingCommandResult(edgeId: string, result: CommandResult): ResolvePendingCommandResult {
    const entry = pendingCommands.get(result.requestId);
    if (!entry) {
        return 'ignored_unknown_request';
    }

    if (entry.edgeId !== edgeId) {
        return 'ignored_edge_mismatch';
    }

    completePendingCommand(result.requestId, {
        kind: 'result',
        result,
    });
    return 'resolved';
}

export function timeoutPendingCommand(requestId: string, completedAt: Date = new Date()): boolean {
    const entry = pendingCommands.get(requestId);
    if (!entry) {
        return false;
    }

    return completePendingCommand(requestId, {
        kind: 'timeout',
        requestId,
        edgeId: entry.edgeId,
        completedAt: completedAt.toISOString(),
    });
}

export function cleanupPendingCommand(requestId: string): boolean {
    const entry = pendingCommands.get(requestId);
    if (!entry) {
        return false;
    }

    pendingCommands.delete(requestId);
    clearTimeout(entry.timer);
    return true;
}

export function resetPendingCommandRegistryForTests(): void {
    for (const entry of pendingCommands.values()) {
        clearTimeout(entry.timer);
    }
    pendingCommands.clear();
}
