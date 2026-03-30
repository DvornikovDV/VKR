import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { User } from '../models/User';
import type { SubscriptionTier } from '../models/User';
import { EdgeServer } from '../models/EdgeServer';
import { Diagram } from '../models/Diagram';
import { AppError } from '../api/middlewares/error.middleware';

// ── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string, label: string): mongoose.Types.ObjectId {
    if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid ${label}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
}

// ── US5 — Self deletion ────────────────────────────────────────────────────

/**
 * Soft-deletes the requesting user's own account.
 * Sets `isDeleted: true` — existing edge server assignments and telemetry
 * references are intentionally preserved for audit purposes (FR-11).
 * Throws 404 if the user document is not found.
 */
async function deleteOwnAccount(userId: string): Promise<void> {
    const result = await User.updateOne(
        { _id: userId, isDeleted: { $ne: true } },
        { $set: { isDeleted: true } },
    );

    if (result.matchedCount === 0) {
        throw new AppError('User not found or already deleted', 404);
    }
}

// ── US6 — Admin: User Management ─────────────────────────────────────────

export interface UserListItem {
    _id: string;
    email: string;
    role: string;
    subscriptionTier: string;
    isDeleted: boolean;
    isBanned: boolean;
    createdAt: Date;
}

export interface UserListResult {
    data: UserListItem[];
    total: number;
    page: number;
    limit: number;
}

/**
 * Returns a paginated, searchable list of all users (Admin-only).
 *
 * @param page    1-based page number (default 1)
 * @param limit   Items per page (default 20, max 100)
 * @param search  Optional substring to match against email (case-insensitive)
 */
async function listUsers(opts: {
    page?: number;
    limit?: number;
    search?: string;
}): Promise<UserListResult> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const filter: mongoose.FilterQuery<typeof User> = {};
    if (opts.search?.trim()) {
        filter['email'] = { $regex: opts.search.trim(), $options: 'i' };
    }

    const [data, total] = await Promise.all([
        User.find(filter)
            .select('-passwordHash')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec(),
        User.countDocuments(filter).exec(),
    ]);

    return {
        data: data as unknown as UserListItem[],
        total,
        page,
        limit,
    };
}

/**
 * Updates a user's subscription tier (Admin-only).
 *
 * @param targetUserId  User._id as string
 * @param tier          'FREE' | 'PRO'
 */
async function updateUserTier(targetUserId: string, tier: SubscriptionTier): Promise<void> {
    const id = toObjectId(targetUserId, 'userId');
    const result = await User.updateOne(
        { _id: id, isDeleted: { $ne: true } },
        { $set: { subscriptionTier: tier } },
    );
    if (result.matchedCount === 0) {
        throw new AppError('User not found', 404);
    }
}

/**
 * Bans or unbans a user account (Admin-only).
 * Banned users receive 401 on every subsequent authenticated request (FR-...).
 *
 * @param targetUserId  User._id as string
 * @param isBanned      true = ban, false = unban
 */
async function updateUserStatus(targetUserId: string, isBanned: boolean): Promise<void> {
    const id = toObjectId(targetUserId, 'userId');
    const result = await User.updateOne(
        { _id: id, isDeleted: { $ne: true } },
        { $set: { isBanned } },
    );
    if (result.matchedCount === 0) {
        throw new AppError('User not found', 404);
    }
}

// ── US6 — User: Profile Stats & Password ──────────────────────────────────

export interface UserStats {
    diagramCount: number;
    edgeServerCount: number;
}

export interface UserSelfProfile {
    _id: string;
    email: string;
    role: string;
    subscriptionTier: SubscriptionTier;
}

/**
 * Returns the latest persisted self-profile for the authenticated user.
 * This must not rely on JWT snapshot fields such as subscription tier.
 *
 * @param userId User._id as string
 */
async function getSelfProfile(userId: string): Promise<UserSelfProfile> {
    const id = toObjectId(userId, 'userId');

    const user = await User.findOne({ _id: id, isDeleted: { $ne: true } })
        .select('_id email role subscriptionTier')
        .lean()
        .exec();

    if (!user) {
        throw new AppError('User not found', 404);
    }

    return {
        _id: user._id.toString(),
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
    };
}

/**
 * Returns usage statistics for the authenticated user:
 *   - Own diagram count
 *   - Count of Edge Servers they have been assigned to
 *
 * @param userId  User._id as string
 */
async function getUserStats(userId: string): Promise<UserStats> {
    const id = toObjectId(userId, 'userId');

    const [diagramCount, edgeServerCount] = await Promise.all([
        Diagram.countDocuments({ ownerId: id, isDeleted: { $ne: true } }).exec(),
        EdgeServer.countDocuments({ trustedUsers: id, lifecycleState: 'Active' }).exec(),
    ]);

    return { diagramCount, edgeServerCount };
}

/**
 * Changes the authenticated user's password.
 * Validates the current password before updating.
 *
 * @param userId       User._id as string
 * @param currentPass  Plaintext current password for verification
 * @param newPass      Plaintext new password (min 8 chars)
 */
async function changePassword(
    userId: string,
    currentPass: string,
    newPass: string,
): Promise<void> {
    if (!newPass || newPass.length < 8) {
        throw new AppError('New password must be at least 8 characters', 400);
    }

    const user = await User.findById(userId).select('+passwordHash').exec();
    if (!user) throw new AppError('User not found', 404);

    const isMatch = await bcrypt.compare(currentPass, user.passwordHash);
    if (!isMatch) {
        throw new AppError('Current password is incorrect', 401);
    }

    const newHash = await bcrypt.hash(newPass, 10);
    await User.updateOne({ _id: user._id }, { $set: { passwordHash: newHash } });
}

// ── Export ────────────────────────────────────────────────────────────────

export const UsersService = {
    // US5
    deleteOwnAccount,
    // US6 Admin
    listUsers,
    updateUserTier,
    updateUserStatus,
    // US6 User
    getSelfProfile,
    getUserStats,
    changePassword,
};
