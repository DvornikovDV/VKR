import mongoose from 'mongoose';
import { DiagramBindings, type IDiagramBindings, type IWidgetBinding } from '../models/DiagramBindings';
import { Diagram } from '../models/Diagram';
import { EdgeServer } from '../models/EdgeServer';
import { AppError } from '../api/middlewares/error.middleware';

// ── Types ─────────────────────────────────────────────────────────────────

export interface UpsertBindingsPayload {
    edgeServerId: string;
    widgetBindings: IWidgetBinding[];
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

    // Atomic upsert — eliminates race condition on unique compound index { diagramId, edgeServerId }
    const before = await DiagramBindings.findOne({ diagramId, edgeServerId }).lean().exec();

    const binding = await DiagramBindings.findOneAndUpdate(
        { diagramId, edgeServerId },
        { $set: { widgetBindings: payload.widgetBindings, ownerId } },
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

// ── Export ────────────────────────────────────────────────────────────────

export const DiagramBindingsService = { listForDiagram, upsert, remove };
