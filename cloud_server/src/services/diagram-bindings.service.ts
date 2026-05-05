import mongoose from 'mongoose';
import { DiagramBindings, type IDiagramBindings, type IWidgetBinding, type ICommandBinding } from '../models/DiagramBindings';
import { Diagram } from '../models/Diagram';
import { EdgeServer } from '../models/EdgeServer';
import { AppError } from '../api/middlewares/error.middleware';
import { normalizeDeviceId, normalizeMetric } from './edge-identity.validation';

// ── Types ─────────────────────────────────────────────────────────────────

export interface UpsertBindingsPayload {
    edgeServerId: string;
    widgetBindings: IWidgetBinding[];
    commandBindings?: ICommandBinding[];
}

export interface UpsertBindingsResult {
    binding: IDiagramBindings;
    /** true = created new record; false = replaced existing */
    created: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string, label: string): mongoose.Types.ObjectId {
    if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid ${label}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Checks that edgeServerId is listed in the EdgeServer's trustedUsers.
 * Static import — EdgeServer.ts exists as of T022 (US3).
 */
async function assertEdgeServerTrusted(
    edgeServerOid: mongoose.Types.ObjectId,
    ownerOid: mongoose.Types.ObjectId,
): Promise<void> {
    const edgeServer = await EdgeServer.findById(edgeServerOid)
        .select('trustedUsers')
        .lean<{ trustedUsers: mongoose.Types.ObjectId[] }>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    const isTrusted = edgeServer.trustedUsers.some((uid) => uid.equals(ownerOid));

    if (!isTrusted) {
        throw new AppError('Edge server is not in user trusted list (FR-8)', 403);
    }
}

// ── Service methods ───────────────────────────────────────────────────────

/**
 * Returns all DiagramBindings for a diagram.
 * Validates that the requesting user owns the diagram.
 */
async function listForDiagram(
    diagramIdStr: string,
    ownerIdStr: string,
): Promise<IDiagramBindings[]> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const ownerId = toObjectId(ownerIdStr, 'ownerId');

    const diagram = await Diagram.exists({ _id: diagramId, ownerId }).exec();
    if (!diagram) {
        throw new AppError('Diagram not found', 404);
    }

    return DiagramBindings.find({ diagramId }).exec();
}

/**
 * Upserts a DiagramBindings set by (diagramId, edgeServerId).
 * Validates that:
 *   1. The diagram exists and is owned by the caller.
 *   2. edgeServerId is in the user's trustedUsers list on EdgeServer.
 */
async function upsert(
    diagramIdStr: string,
    ownerIdStr: string,
    payload: UpsertBindingsPayload,
): Promise<UpsertBindingsResult> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const ownerId = toObjectId(ownerIdStr, 'ownerId');
    const edgeServerId = toObjectId(payload.edgeServerId, 'edgeServerId');

    // Validate diagram ownership
    const diagram = await Diagram.exists({ _id: diagramId, ownerId }).exec();
    if (!diagram) {
        throw new AppError('Diagram not found', 404);
    }

    // Validate edgeServer is in user's trustedUsers
    await assertEdgeServerTrusted(edgeServerId, ownerId);

    const normalizedBindings = payload.widgetBindings.map((binding, index) => {
        const widgetId = typeof binding.widgetId === 'string' ? binding.widgetId.trim() : '';
        const deviceId = normalizeDeviceId(binding.deviceId);
        const metric = normalizeMetric(binding.metric);

        if (!widgetId) {
            throw new AppError(`widgetBindings[${index}].widgetId is required`, 400);
        }
        if (!deviceId) {
            throw new AppError(
                `widgetBindings[${index}].deviceId must match [A-Za-z0-9._-]+`,
                400,
            );
        }
        if (!metric) {
            throw new AppError(
                `widgetBindings[${index}].metric must match [A-Za-z0-9._:/%-]+`,
                400,
            );
        }

        return { widgetId, deviceId, metric };
    });

    // Normalize commandBindings — legacy payloads that omit the field default to []
    const rawCommandBindings: unknown[] = Array.isArray(payload.commandBindings)
        ? payload.commandBindings
        : [];

    const VALID_COMMAND_TYPES = new Set(['set_bool', 'set_number']);

    const normalizedCommandBindings = rawCommandBindings.map((entry, index) => {
        const b = entry as Record<string, unknown>;
        const widgetId = typeof b.widgetId === 'string' ? b.widgetId.trim() : '';
        const deviceId = normalizeDeviceId(b.deviceId);
        const commandType = typeof b.commandType === 'string' ? b.commandType : '';

        if (!widgetId) {
            throw new AppError(`commandBindings[${index}].widgetId is required`, 400);
        }
        if (!deviceId) {
            throw new AppError(
                `commandBindings[${index}].deviceId must match [A-Za-z0-9._-]+`,
                400,
            );
        }
        if (!VALID_COMMAND_TYPES.has(commandType)) {
            throw new AppError(
                `commandBindings[${index}].commandType must be 'set_bool' or 'set_number'`,
                400,
            );
        }

        return { widgetId, deviceId, commandType } as ICommandBinding;
    });

    // Atomic upsert — eliminates race condition on unique compound index { diagramId, edgeServerId }
    const before = await DiagramBindings.findOne({ diagramId, edgeServerId }).lean().exec();

    const binding = await DiagramBindings.findOneAndUpdate(
        { diagramId, edgeServerId },
        { $set: { widgetBindings: normalizedBindings, commandBindings: normalizedCommandBindings, ownerId } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();

    if (!binding) {
        throw new AppError('Failed to upsert binding', 500);
    }

    return { binding, created: before === null };
}

/**
 * Deletes a specific DiagramBindings set by (diagramId, edgeServerId).
 * Validates diagram ownership.
 */
async function remove(
    diagramIdStr: string,
    ownerIdStr: string,
    edgeServerIdStr: string,
): Promise<void> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const ownerId = toObjectId(ownerIdStr, 'ownerId');
    const edgeServerId = toObjectId(edgeServerIdStr, 'edgeServerId');

    // Ensure user owns the parent diagram
    const diagram = await Diagram.exists({ _id: diagramId, ownerId }).exec();
    if (!diagram) {
        throw new AppError('Diagram not found', 404);
    }

    const deleted = await DiagramBindings.findOneAndDelete({ diagramId, edgeServerId }).exec();
    if (!deleted) {
        throw new AppError('Binding not found', 404);
    }
}

/**
 * Deletes all DiagramBindings sets for a diagram.
 * Validates diagram ownership and remains idempotent for empty binding sets.
 */
async function removeAllForDiagram(
    diagramIdStr: string,
    ownerIdStr: string,
): Promise<void> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const ownerId = toObjectId(ownerIdStr, 'ownerId');

    const diagram = await Diagram.exists({ _id: diagramId, ownerId }).exec();
    if (!diagram) {
        throw new AppError('Diagram not found', 404);
    }

    await DiagramBindings.deleteMany({ diagramId }).exec();
}

// ── Export ────────────────────────────────────────────────────────────────

export const DiagramBindingsService = { listForDiagram, upsert, remove, removeAllForDiagram };
