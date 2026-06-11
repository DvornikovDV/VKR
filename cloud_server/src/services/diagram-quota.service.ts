import mongoose, { type Types } from 'mongoose';
import { AppError } from '../api/middlewares/error.middleware';
import { Diagram, type DiagramLayout, type IDiagram } from '../models/Diagram';
import { User, type SubscriptionTier, type UserRole } from '../models/User';

export const FREE_DIAGRAM_QUOTA = 3;
export const DIAGRAM_QUOTA_EXCEEDED = `FREE tier diagram quota (${FREE_DIAGRAM_QUOTA}) exceeded`;
export const DUPLICATE_DIAGRAM_ASSIGNMENT = 'Diagram template is already assigned to this user';
export const INVALID_ASSIGNMENT_TARGET = 'Assignment target must be an active USER';

const SOURCE_TEMPLATE_INDEX = 'uniq_diagram_owner_source_template';
const QUOTA_SLOT_INDEX = 'uniq_diagram_owner_quota_slot';
const FREE_QUOTA_SLOTS = [1, 2, 3] as const;
const RECONCILIATION_ATTEMPTS = 3;
const MUTATION_WAIT_ATTEMPTS = 500;
const MUTATION_WAIT_MS = 10;
const QUOTA_MUTATION_IN_PROGRESS = 'Diagram quota reconciliation is in progress';

export interface QuotaAwareDiagramPayload {
    name: string;
    layout: DiagramLayout;
    sourceTemplateId?: Types.ObjectId;
}

interface DuplicateKeyError {
    code?: number;
    keyPattern?: Record<string, number>;
    message?: string;
}

export interface DiagramQuotaMigrationResult {
    freeOwnersReconciled: number;
    slotsCleared: number;
}

interface QuotaOwnerSnapshot {
    _id: Types.ObjectId;
    role: UserRole;
    subscriptionTier: SubscriptionTier;
}

function toOwnerId(ownerId: string | Types.ObjectId): Types.ObjectId {
    if (ownerId instanceof mongoose.Types.ObjectId) return ownerId;
    if (!mongoose.isValidObjectId(ownerId)) {
        throw new AppError('Invalid ownerId', 400);
    }
    return new mongoose.Types.ObjectId(ownerId);
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
    return typeof error === 'object' && error !== null && (error as DuplicateKeyError).code === 11000;
}

function conflictsWithIndex(error: DuplicateKeyError, indexName: string, key: string): boolean {
    return error.message?.includes(indexName) === true || error.keyPattern?.[key] === 1;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPayload(
    ownerId: Types.ObjectId,
    payload: QuotaAwareDiagramPayload,
    quotaSlot?: 1 | 2 | 3,
): Record<string, unknown> {
    return {
        ownerId,
        name: payload.name,
        layout: payload.layout,
        ...(payload.sourceTemplateId ? { sourceTemplateId: payload.sourceTemplateId } : {}),
        ...(quotaSlot ? { quotaSlot } : {}),
    };
}

async function mapDuplicateConflict(
    error: DuplicateKeyError,
    ownerId: Types.ObjectId,
    sourceTemplateId?: Types.ObjectId,
): Promise<void> {
    if (conflictsWithIndex(error, SOURCE_TEMPLATE_INDEX, 'sourceTemplateId')) {
        throw new AppError(DUPLICATE_DIAGRAM_ASSIGNMENT, 409);
    }

    if (sourceTemplateId) {
        const duplicateAssignment = await Diagram.exists({ ownerId, sourceTemplateId }).exec();
        if (duplicateAssignment) {
            throw new AppError(DUPLICATE_DIAGRAM_ASSIGNMENT, 409);
        }
    }

    if (!conflictsWithIndex(error, QUOTA_SLOT_INDEX, 'quotaSlot')) {
        throw error;
    }
}

async function createFreeDiagram(
    ownerId: Types.ObjectId,
    payload: QuotaAwareDiagramPayload,
): Promise<IDiagram> {
    if (payload.sourceTemplateId) {
        const duplicateAssignment = await Diagram.exists({
            ownerId,
            sourceTemplateId: payload.sourceTemplateId,
        }).exec();
        if (duplicateAssignment) {
            throw new AppError(DUPLICATE_DIAGRAM_ASSIGNMENT, 409);
        }
    }

    for (const quotaSlot of FREE_QUOTA_SLOTS) {
        const ownedCount = await Diagram.countDocuments({ ownerId }).exec();
        if (ownedCount >= FREE_DIAGRAM_QUOTA) {
            throw new AppError(DIAGRAM_QUOTA_EXCEEDED, 403);
        }

        try {
            return await Diagram.create(createPayload(ownerId, payload, quotaSlot));
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
            await mapDuplicateConflict(error, ownerId, payload.sourceTemplateId);
        }
    }

    throw new AppError(DIAGRAM_QUOTA_EXCEEDED, 403);
}

async function createDiagramForOwner(
    ownerIdValue: string | Types.ObjectId,
    ownerRole: UserRole,
    subscriptionTier: SubscriptionTier,
    payload: QuotaAwareDiagramPayload,
): Promise<IDiagram> {
    const ownerId = toOwnerId(ownerIdValue);

    if (ownerRole === 'USER' && subscriptionTier === 'FREE') {
        return createFreeDiagram(ownerId, payload);
    }

    try {
        return await Diagram.create(createPayload(ownerId, payload));
    } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        await mapDuplicateConflict(error, ownerId, payload.sourceTemplateId);
        throw error;
    }
}

async function beginOwnerCreate(
    ownerId: Types.ObjectId,
    requiredRole?: UserRole,
): Promise<QuotaOwnerSnapshot> {
    const owner = await User.findOneAndUpdate(
        {
            _id: ownerId,
            isDeleted: { $ne: true },
            isBanned: { $ne: true },
            ...(requiredRole ? { role: requiredRole } : {}),
            diagramQuotaMutationPending: { $ne: true },
        },
        { $inc: { diagramQuotaActiveCreates: 1 } },
        { new: true },
    )
        .select('+diagramQuotaMutationPending +diagramQuotaActiveCreates role subscriptionTier')
        .lean()
        .exec();

    if (owner) {
        return owner;
    }

    const existing = await User.findById(ownerId)
        .select('+diagramQuotaMutationPending role isDeleted isBanned')
        .lean()
        .exec();

    if (!existing) {
        throw new AppError('User not found', 404);
    }
    if (
        requiredRole !== undefined
        && (existing.isDeleted || existing.isBanned || existing.role !== requiredRole)
    ) {
        throw new AppError(INVALID_ASSIGNMENT_TARGET, 403);
    }
    if (existing.isDeleted || existing.isBanned) {
        throw new AppError('User not found', 404);
    }
    throw new AppError(QUOTA_MUTATION_IN_PROGRESS, 409);
}

async function endOwnerCreate(ownerId: Types.ObjectId): Promise<void> {
    await User.updateOne(
        { _id: ownerId, diagramQuotaActiveCreates: { $gt: 0 } },
        { $inc: { diagramQuotaActiveCreates: -1 } },
    ).exec();
}

async function createForPersistedOwner(
    ownerIdValue: string | Types.ObjectId,
    payload: QuotaAwareDiagramPayload,
    requiredRole?: UserRole,
): Promise<IDiagram> {
    const ownerId = toOwnerId(ownerIdValue);
    const owner = await beginOwnerCreate(ownerId, requiredRole);

    try {
        return await createDiagramForOwner(ownerId, owner.role, owner.subscriptionTier, payload);
    } finally {
        await endOwnerCreate(ownerId);
    }
}

async function createDiagram(
    ownerIdValue: string | Types.ObjectId,
    _ownerRole: UserRole,
    _subscriptionTier: SubscriptionTier,
    payload: QuotaAwareDiagramPayload,
): Promise<IDiagram> {
    return createForPersistedOwner(ownerIdValue, payload);
}

async function assignNewestFreeSlots(ownerId: Types.ObjectId): Promise<void> {
    const newest = await Diagram.find({ ownerId })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(FREE_DIAGRAM_QUOTA)
        .select('_id')
        .lean()
        .exec();

    for (let index = 0; index < newest.length; index += 1) {
        await Diagram.updateOne(
            { _id: newest[index]!._id, ownerId },
            { $set: { quotaSlot: FREE_QUOTA_SLOTS[index] } },
            { timestamps: false },
        ).exec();
    }
}

async function reconcileOwnerQuotaSlotsLocked(
    ownerId: Types.ObjectId,
    ownerRole: UserRole,
    subscriptionTier: SubscriptionTier,
): Promise<void> {
    for (let attempt = 0; attempt < RECONCILIATION_ATTEMPTS; attempt += 1) {
        await Diagram.updateMany(
            { ownerId },
            { $unset: { quotaSlot: 1 } },
            { timestamps: false },
        ).exec();

        if (ownerRole !== 'USER' || subscriptionTier !== 'FREE') {
            return;
        }

        try {
            await assignNewestFreeSlots(ownerId);
            return;
        } catch (error) {
            if (!isDuplicateKeyError(error) || attempt === RECONCILIATION_ATTEMPTS - 1) {
                throw error;
            }
        }
    }
}

async function acquireOwnerMutation(ownerId: Types.ObjectId): Promise<QuotaOwnerSnapshot> {
    for (let attempt = 0; attempt < MUTATION_WAIT_ATTEMPTS; attempt += 1) {
        const owner = await User.findOneAndUpdate(
            {
                _id: ownerId,
                isDeleted: { $ne: true },
                diagramQuotaMutationPending: { $ne: true },
                diagramQuotaActiveCreates: 0,
            },
            { $set: { diagramQuotaMutationPending: true } },
            { new: true },
        )
            .select('+diagramQuotaMutationPending +diagramQuotaActiveCreates role subscriptionTier')
            .lean()
            .exec();

        if (owner) {
            return owner;
        }

        const existing = await User.findById(ownerId)
            .select('+diagramQuotaMutationPending +diagramQuotaActiveCreates')
            .lean()
            .exec();
        if (!existing) {
            throw new AppError('User not found', 404);
        }
        if (existing.diagramQuotaMutationPending) {
            throw new AppError(QUOTA_MUTATION_IN_PROGRESS, 409);
        }
        await sleep(MUTATION_WAIT_MS);
    }

    throw new AppError(QUOTA_MUTATION_IN_PROGRESS, 409);
}

async function releaseOwnerMutation(ownerId: Types.ObjectId): Promise<void> {
    await User.updateOne(
        { _id: ownerId },
        { $set: { diagramQuotaMutationPending: false } },
    ).exec();
}

async function runWithOwnerQuotaMutation<T>(
    ownerIdValue: string | Types.ObjectId,
    operation: (owner: QuotaOwnerSnapshot) => Promise<T>,
): Promise<T> {
    const ownerId = toOwnerId(ownerIdValue);
    const owner = await acquireOwnerMutation(ownerId);
    try {
        const result = await operation(owner);
        await releaseOwnerMutation(ownerId);
        return result;
    } catch (error) {
        if (error instanceof AppError && error.statusCode === 404) {
            await releaseOwnerMutation(ownerId);
        }
        throw error;
    }
}

async function reconcileOwnerQuotaSlots(ownerIdValue: string | Types.ObjectId): Promise<void> {
    await runWithOwnerQuotaMutation(ownerIdValue, async (owner) => {
        await reconcileOwnerQuotaSlotsLocked(owner._id, owner.role, owner.subscriptionTier);
    });
}

async function updateOwnerTier(
    ownerIdValue: string | Types.ObjectId,
    subscriptionTier: SubscriptionTier,
): Promise<void> {
    const ownerId = toOwnerId(ownerIdValue);
    const owner = await acquireOwnerMutation(ownerId);

    await reconcileOwnerQuotaSlotsLocked(ownerId, owner.role, subscriptionTier);
    const result = await User.updateOne(
        { _id: ownerId, diagramQuotaMutationPending: true },
        {
            $set: {
                subscriptionTier,
                diagramQuotaMutationPending: false,
            },
        },
    ).exec();
    if (result.matchedCount !== 1) {
        throw new AppError(QUOTA_MUTATION_IN_PROGRESS, 409);
    }
}

async function reconcileAllQuotaSlots(): Promise<DiagramQuotaMigrationResult> {
    await User.updateMany(
        {},
        {
            $set: {
                diagramQuotaMutationPending: true,
                diagramQuotaActiveCreates: 0,
            },
        },
    ).exec();
    const clearResult = await Diagram.updateMany(
        { quotaSlot: { $exists: true } },
        { $unset: { quotaSlot: 1 } },
        { timestamps: false },
    ).exec();
    const owners = await User.find({})
        .select('_id role subscriptionTier')
        .lean()
        .exec();

    for (const owner of owners) {
        await reconcileOwnerQuotaSlotsLocked(owner._id, owner.role, owner.subscriptionTier);
    }

    await User.updateMany(
        {},
        { $set: { diagramQuotaMutationPending: false } },
    ).exec();

    return {
        freeOwnersReconciled: owners.filter(
            (owner) => owner.role === 'USER' && owner.subscriptionTier === 'FREE',
        ).length,
        slotsCleared: clearResult.modifiedCount,
    };
}

export const DiagramQuotaService = {
    createDiagram,
    createForPersistedOwner,
    runWithOwnerQuotaMutation,
    reconcileOwnerQuotaSlotsLocked,
    reconcileOwnerQuotaSlots,
    updateOwnerTier,
    reconcileAllQuotaSlots,
};
