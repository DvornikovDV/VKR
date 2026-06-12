import mongoose, { type Types } from 'mongoose';
import { AppError } from '../api/middlewares/error.middleware';
import { Diagram, type DiagramLayout, type IDiagram } from '../models/Diagram';
import { User, type SubscriptionTier, type UserRole } from '../models/User';
import { MutationLeaseService } from './mutation-lease.service';

export const FREE_DIAGRAM_QUOTA = 3;
export const DIAGRAM_QUOTA_EXCEEDED = `FREE tier diagram quota (${FREE_DIAGRAM_QUOTA}) exceeded`;
export const DUPLICATE_DIAGRAM_ASSIGNMENT = 'Diagram template is already assigned to this user';
export const INVALID_ASSIGNMENT_TARGET = 'Assignment target must be an active USER';

const SOURCE_TEMPLATE_INDEX = 'uniq_diagram_owner_source_template';
const QUOTA_SLOT_INDEX = 'uniq_diagram_owner_quota_slot';
const FREE_QUOTA_SLOTS = [1, 2, 3] as const;
const RECONCILIATION_ATTEMPTS = 3;

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

export function ownerMutationLeaseKey(ownerId: string | Types.ObjectId): string {
    return `user:${toOwnerId(ownerId).toString()}`;
}

async function readPersistedOwner(
    ownerId: Types.ObjectId,
    requiredRole?: UserRole,
): Promise<QuotaOwnerSnapshot> {
    const owner = await User.findOne(
        {
            _id: ownerId,
            isDeleted: { $ne: true },
            isBanned: { $ne: true },
            ...(requiredRole ? { role: requiredRole } : {}),
        },
    )
        .select('role subscriptionTier')
        .lean()
        .exec();

    if (owner) {
        return owner;
    }

    const existing = await User.findById(ownerId)
        .select('role isDeleted isBanned')
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
    throw new AppError('User not found', 404);
}

async function createForPersistedOwnerLocked(
    ownerIdValue: string | Types.ObjectId,
    payload: QuotaAwareDiagramPayload,
    requiredRole?: UserRole,
): Promise<IDiagram> {
    const ownerId = toOwnerId(ownerIdValue);
    const owner = await readPersistedOwner(ownerId, requiredRole);
    return createDiagramForOwner(ownerId, owner.role, owner.subscriptionTier, payload);
}

async function createForPersistedOwner(
    ownerIdValue: string | Types.ObjectId,
    payload: QuotaAwareDiagramPayload,
    requiredRole?: UserRole,
): Promise<IDiagram> {
    return MutationLeaseService.runWithMutationLeases(
        [ownerMutationLeaseKey(ownerIdValue)],
        () => createForPersistedOwnerLocked(ownerIdValue, payload, requiredRole),
    );
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

async function runWithOwnerQuotaMutation<T>(
    ownerIdValue: string | Types.ObjectId,
    operation: (owner: QuotaOwnerSnapshot) => Promise<T>,
): Promise<T> {
    const ownerId = toOwnerId(ownerIdValue);
    return MutationLeaseService.runWithMutationLeases(
        [ownerMutationLeaseKey(ownerId)],
        async () => {
            const owner = await readOwnerQuotaSnapshotLocked(ownerId);
            return operation(owner);
        },
    );
}

async function readOwnerQuotaSnapshotLocked(
    ownerIdValue: string | Types.ObjectId,
): Promise<QuotaOwnerSnapshot> {
    const owner = await User.findById(toOwnerId(ownerIdValue))
        .select('role subscriptionTier')
        .lean()
        .exec();
    if (!owner) {
        throw new AppError('User not found', 404);
    }
    return owner;
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
    await runWithOwnerQuotaMutation(ownerId, async (owner) => {
        const result = await User.updateOne(
            { _id: ownerId },
            { $set: { subscriptionTier } },
        ).exec();
        if (result.matchedCount !== 1) {
            throw new AppError('User not found', 404);
        }
        await reconcileOwnerQuotaSlotsLocked(ownerId, owner.role, subscriptionTier);
    });
}

async function reconcileAllQuotaSlots(): Promise<DiagramQuotaMigrationResult> {
    const ownerIds = await User.find({}).select('_id').lean().exec();
    let slotsCleared = 0;
    let freeOwnersReconciled = 0;

    for (const owner of ownerIds) {
        await MutationLeaseService.runWithMutationLeases(
            [ownerMutationLeaseKey(owner._id)],
            async () => {
                const currentOwner = await readOwnerQuotaSnapshotLocked(owner._id);
                const clearResult = await Diagram.updateMany(
                    { ownerId: owner._id, quotaSlot: { $exists: true } },
                    { $unset: { quotaSlot: 1 } },
                    { timestamps: false },
                ).exec();
                slotsCleared += clearResult.modifiedCount;
                await reconcileOwnerQuotaSlotsLocked(
                    owner._id,
                    currentOwner.role,
                    currentOwner.subscriptionTier,
                );
                if (currentOwner.role === 'USER' && currentOwner.subscriptionTier === 'FREE') {
                    freeOwnersReconciled += 1;
                }
            },
        );
    }

    return {
        freeOwnersReconciled,
        slotsCleared,
    };
}

export const DiagramQuotaService = {
    createDiagram,
    createForPersistedOwner,
    createForPersistedOwnerLocked,
    readOwnerQuotaSnapshotLocked,
    runWithOwnerQuotaMutation,
    reconcileOwnerQuotaSlotsLocked,
    reconcileOwnerQuotaSlots,
    updateOwnerTier,
    reconcileAllQuotaSlots,
};
