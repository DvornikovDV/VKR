import { User } from '../models/User';
import { AppError } from '../api/middlewares/error.middleware';

// ── Service methods ───────────────────────────────────────────────────────

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

// ── Export ────────────────────────────────────────────────────────────────

export const UsersService = { deleteOwnAccount };
