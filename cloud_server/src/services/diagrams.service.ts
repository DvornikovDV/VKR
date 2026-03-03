import mongoose from 'mongoose';
import { Diagram, type IDiagram } from '../models/Diagram';
import { DiagramBindings } from '../models/DiagramBindings';
import { AppError } from '../api/middlewares/error.middleware';


// ── Constants ─────────────────────────────────────────────────────────────

const FREE_DIAGRAM_QUOTA = 3;

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
    subscriptionTier: string,
    payload: CreateDiagramPayload,
): Promise<IDiagram> {
    const ownerId = toObjectId(ownerIdStr, 'ownerId');

    if (subscriptionTier === 'FREE') {
        const count = await Diagram.countDocuments({ ownerId }).exec();
        if (count >= FREE_DIAGRAM_QUOTA) {
            throw new AppError(
                `FREE tier diagram quota (${FREE_DIAGRAM_QUOTA}) exceeded`,
                403,
            );
        }
    }

    const diagram = await Diagram.create({
        ownerId,
        name: payload.name,
        layout: payload.layout,
    });

    return diagram;
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

    const updated = await Diagram.findOneAndUpdate(
        { _id: diagramId, ownerId, __v: payload.__v },
        { $set: updatePayload, $inc: { __v: 1 } },
        { new: true },
    ).exec();

    if (!updated) {
        // Distinguish not-found from version conflict
        const exists = await Diagram.exists({ _id: diagramId, ownerId }).exec();
        if (!exists) {
            throw new AppError('Diagram not found', 404);
        }
        throw new AppError('Version conflict — diagram was modified by another session', 409);
    }

    // Check whether any DiagramBindings exist for this diagram
    const bindingsCount = await DiagramBindings.countDocuments({ diagramId }).exec();
    return { diagram: updated, bindingsInvalidated: bindingsCount > 0 };
}

/**
 * Hard-deletes a diagram and cascade-deletes all its DiagramBindings.
 * Throws 404 if not found.
 */
async function hardDelete(diagramIdStr: string, ownerIdStr: string): Promise<void> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const ownerId = toObjectId(ownerIdStr, 'ownerId');

    const deleted = await Diagram.findOneAndDelete({ _id: diagramId, ownerId }).exec();
    if (!deleted) {
        throw new AppError('Diagram not found', 404);
    }

    // Cascade-delete all binding sets for this diagram
    await DiagramBindings.deleteMany({ diagramId }).exec();
}

/**
 * Admin: transfers diagram ownership to targetUserId.
 * DiagramBindings are NOT transferred.
 * Throws 404 if admin doesn't own the diagram.
 */
async function assignDiagram(
    adminIdStr: string,
    diagramIdStr: string,
    targetUserIdStr: string,
): Promise<IDiagram> {
    const diagramId = toObjectId(diagramIdStr, 'diagramId');
    const adminId = toObjectId(adminIdStr, 'adminId');
    const targetUserId = toObjectId(targetUserIdStr, 'targetUserId');

    // Ownership check: admin must own the diagram
    const diagram = await Diagram.findOne({ _id: diagramId, ownerId: adminId }).exec();
    if (!diagram) {
        throw new AppError('Diagram not found or not owned by admin', 403);
    }

    diagram.ownerId = targetUserId;
    await diagram.save();

    return diagram;
}

// ── Export ────────────────────────────────────────────────────────────────

export const DiagramsService = { listOwned, getById, create, update, hardDelete, assignDiagram };

// Re-export FREE quota constant for tests
export { FREE_DIAGRAM_QUOTA };
