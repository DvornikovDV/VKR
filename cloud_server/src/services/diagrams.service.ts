import mongoose from 'mongoose';
import { Diagram, type IDiagram } from '../models/Diagram';
import { DiagramBindings } from '../models/DiagramBindings';
import { AppError } from '../api/middlewares/error.middleware';
import {
    DiagramQuotaService,
    FREE_DIAGRAM_QUOTA,
    ownerMutationLeaseKey,
} from './diagram-quota.service';
import { MutationLeaseService } from './mutation-lease.service';


// ── Constants ─────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────

export interface CreateDiagramPayload {
    name: string;
    layout: Record<string, unknown>;
}

export interface UpdateDiagramPayload {
    name?: string;
    layout?: Record<string, unknown>;
    /** OCC version key — must match current document __v */
    __v: number;
}

export interface UpdateDiagramResult {
    diagram: IDiagram;
    bindingsInvalidated: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string, label: string): mongoose.Types.ObjectId {
    if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid ${label}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
}

function diagramMutationLeaseKey(diagramId: mongoose.Types.ObjectId): string {
    return `diagram:${diagramId.toString()}`;
}

// ── Service methods ───────────────────────────────────────────────────────

/**
 * Returns all diagrams owned by the user.
 */
async function listOwned(ownerIdStr: string): Promise<IDiagram[]> {
    const ownerId = toObjectId(ownerIdStr, 'ownerId');
    return Diagram.find({ ownerId }).sort({ createdAt: -1 }).exec();
}

/**
 * Returns a single diagram by id.
 * Throws 404 if not found or not owned by the caller.
 */
async function getById(diagramIdStr: string, ownerIdStr: string): Promise<IDiagram> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const ownerId = toObjectId(ownerIdStr, 'ownerId');
    const diagram = await Diagram.findOne({ _id: diagramId, ownerId }).exec();
    if (!diagram) {
        throw new AppError('Diagram not found', 404);
    }
    return diagram;
}

/**
 * Creates a new diagram ("Save As").
 * Enforces FREE tier quota: max 3 diagrams per user.
 */
async function create(
    ownerIdStr: string,
    payload: CreateDiagramPayload,
): Promise<IDiagram> {
    return DiagramQuotaService.createForPersistedOwner(ownerIdStr, payload);
}

/**
 * Replaces layout and name in-place using OCC.
 * Throws 409 if __v mismatch (concurrent edit detected).
 * Returns { diagram, bindingsInvalidated }.
 */
async function update(
    diagramIdStr: string,
    ownerIdStr: string,
    payload: UpdateDiagramPayload,
): Promise<UpdateDiagramResult> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const ownerId = toObjectId(ownerIdStr, 'ownerId');

    // OCC: find and update only if __v matches
    const updatePayload: Record<string, unknown> = {};
    if (payload.name !== undefined) updatePayload['name'] = payload.name;
    if (payload.layout !== undefined) updatePayload['layout'] = payload.layout;
    updatePayload['updatedAt'] = new Date();

    return MutationLeaseService.runWithMutationLeases(
        [diagramMutationLeaseKey(diagramId)],
        async () => {
            const updated = await Diagram.findOneAndUpdate(
                { _id: diagramId, ownerId, __v: payload.__v },
                { $set: updatePayload, $inc: { __v: 1 } },
                { new: true },
            ).exec();

            if (!updated) {
                const exists = await Diagram.exists({ _id: diagramId, ownerId }).exec();
                if (!exists) {
                    throw new AppError('Diagram not found', 404);
                }
                throw new AppError('Version conflict — diagram was modified by another session', 409);
            }

            const bindingsCount = await DiagramBindings.countDocuments({ diagramId }).exec();
            return { diagram: updated, bindingsInvalidated: bindingsCount > 0 };
        },
    );
}

/**
 * Hard-deletes a diagram and cascade-deletes all its DiagramBindings.
 * Throws 404 if not found.
 */
async function hardDelete(diagramIdStr: string, ownerIdStr: string): Promise<void> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const ownerId = toObjectId(ownerIdStr, 'ownerId');

    await MutationLeaseService.runWithMutationLeases(
        [diagramMutationLeaseKey(diagramId), ownerMutationLeaseKey(ownerId)],
        async () => {
            const owner = await DiagramQuotaService.readOwnerQuotaSnapshotLocked(ownerId);
            const deleted = await Diagram.findOneAndDelete({ _id: diagramId, ownerId }).exec();
            if (!deleted) {
                throw new AppError('Diagram not found', 404);
            }

            await DiagramBindings.deleteMany({ diagramId }).exec();
            await DiagramQuotaService.reconcileOwnerQuotaSlotsLocked(
                ownerId,
                owner.role,
                owner.subscriptionTier,
            );
        },
    );
}

/**
 * Admin: creates an independent User-owned copy of an Admin template.
 * The source template and its bindings remain unchanged.
 */
async function assignDiagram(
    adminIdStr: string,
    diagramIdStr: string,
    targetUserIdStr: string,
): Promise<IDiagram> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const adminId = toObjectId(adminIdStr, 'adminId');
    const targetUserId = toObjectId(targetUserIdStr, 'targetUserId');

    return MutationLeaseService.runWithMutationLeases(
        [diagramMutationLeaseKey(diagramId), ownerMutationLeaseKey(targetUserId)],
        async () => {
            const template = await Diagram.findOne({ _id: diagramId, ownerId: adminId }).lean().exec();
            if (!template) {
                throw new AppError('Diagram not found or not owned by admin', 403);
            }

            return DiagramQuotaService.createForPersistedOwnerLocked(
                targetUserId,
                {
                    name: template.name,
                    layout: template.layout,
                    sourceTemplateId: template._id,
                },
                'USER',
            );
        },
    );
}

// ── Export ────────────────────────────────────────────────────────────────

export const DiagramsService = { listOwned, getById, create, update, hardDelete, assignDiagram };

// Re-export FREE quota constant for tests
export { FREE_DIAGRAM_QUOTA };
