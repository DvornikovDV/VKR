import mongoose from 'mongoose';
import { EdgeServer, type IEdgeServer } from '../models/EdgeServer';
import { User } from '../models/User';
import { Telemetry } from '../models/Telemetry';
import { AppError } from '../api/middlewares/error.middleware';

// ── Constants ─────────────────────────────────────────────────────────────

/** Max trusted edge servers for FREE tier (FR-2b). */
export const FREE_EDGE_SERVER_QUOTA = 1;

/** Online threshold: edge is considered online if lastSeen < PING_THRESHOLD_MS ago. */
const PING_THRESHOLD_MS = 3_000;

// ── In-memory last-seen registry ──────────────────────────────────────────

/**
 * In-memory map: edgeId (string) → timestamp (ms) of the last telemetry batch.
 * Updated by the WebSocket telemetry handler (T031/T032) via `updateLastSeen`.
 * Not persisted — resets on process restart. Used only for ping checks.
 */
export const lastSeenRegistry = new Map<string, number>();

/**
 * Called by the WebSocket edge handler when a telemetry batch arrives.
 * Updates both the in-memory registry and (asynchronously) the DB `lastSeen` field.
 */
export function updateLastSeen(edgeId: string): void {
    lastSeenRegistry.set(edgeId, Date.now());
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toObjectId(id: string, label: string): mongoose.Types.ObjectId {
    if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid ${label}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
}

/** Counts how many trusted edge servers a user is already assigned to. */
async function countUserEdgeServers(userId: mongoose.Types.ObjectId): Promise<number> {
    return EdgeServer.countDocuments({ trustedUsers: userId }).exec();
}

// ── Service methods ───────────────────────────────────────────────────────

/**
 * Registers a new EdgeServer.
 * Admin-only operation — caller must enforce role at controller level.
 *
 * @param name        Human-readable name
 * @param apiKeyHash  Pre-hashed API key
 * @param createdBy   Admin user ID who registers it
 */
async function register(
    name: string,
    apiKeyHash: string,
    createdBy?: string,
): Promise<IEdgeServer> {
    const edgeServer = await EdgeServer.create({
        name,
        apiKeyHash,
        createdBy: createdBy ?? null,
    });
    return edgeServer;
}

/**
 * Returns all EdgeServers where the given userId is in trustedUsers.
 * Regular users only see their own trusted servers.
 */
async function listForUser(userIdStr: string): Promise<IEdgeServer[]> {
    const userId = toObjectId(userIdStr, 'userId');
    return EdgeServer.find({ trustedUsers: userId }).exec();
}

/**
 * Returns all EdgeServers (internal use — no population).
 */
async function listAll(): Promise<IEdgeServer[]> {
    return EdgeServer.find().exec();
}

/**
 * Returns all EdgeServers for Admin Fleet view, with populated
 * trustedUsers (id, email) and createdBy (id, email).
 * apiKeyHash is excluded from the response.
 */
async function listAllForAdmin(): Promise<unknown[]> {
    return EdgeServer.find()
        .select('-apiKeyHash')
        .populate('trustedUsers', 'email role subscriptionTier')
        .populate('createdBy', 'email')
        .lean()
        .exec();
}

/**
 * Assigns a user to the trustedUsers list of an EdgeServer.
 * Enforces FREE tier limit of 1 trusted edge server per user (FR-2b).
 *
 * @param edgeIdStr   EdgeServer._id as string
 * @param targetUserIdStr  User._id to add
 */
async function assignUserToEdge(edgeIdStr: string, targetUserIdStr: string): Promise<IEdgeServer> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const targetUserId = toObjectId(targetUserIdStr, 'targetUserId');

    const [edgeServer, targetUser] = await Promise.all([
        EdgeServer.findById(edgeId).exec(),
        User.findById(targetUserId).exec(),
    ]);

    if (!edgeServer) throw new AppError('Edge server not found', 404);
    if (!targetUser) throw new AppError('User not found', 404);

    // Check if user is already in trustedUsers
    const alreadyTrusted = edgeServer.trustedUsers.some((uid) => uid.equals(targetUserId));
    if (alreadyTrusted) {
        throw new AppError('User is already assigned to this edge server', 409);
    }

    // Enforce FREE tier quota (FR-2b): FREE user ≤ 1 trusted edge server
    if (targetUser.subscriptionTier === 'FREE') {
        const currentCount = await countUserEdgeServers(targetUserId);
        if (currentCount >= FREE_EDGE_SERVER_QUOTA) {
            throw new AppError(
                `FREE tier edge server quota (${FREE_EDGE_SERVER_QUOTA}) exceeded`,
                403,
            );
        }
    }

    // Atomic $addToSet prevents race conditions on concurrent bind requests
    const updated = await EdgeServer.findByIdAndUpdate(
        edgeId,
        { $addToSet: { trustedUsers: targetUserId } },
        { new: true },
    ).exec();

    if (!updated) throw new AppError('Edge server not found', 404);
    return updated;
}

/**
 * Removes a user from the trustedUsers list of an EdgeServer.
 *
 * @param edgeIdStr       EdgeServer._id as string
 * @param targetUserIdStr User._id to remove
 */
async function removeUserFromEdge(edgeIdStr: string, targetUserIdStr: string): Promise<IEdgeServer> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const targetUserId = toObjectId(targetUserIdStr, 'targetUserId');

    // Verify user is actually assigned before attempting removal
    const edgeServerCheck = await EdgeServer.findById(edgeId).select('trustedUsers').lean().exec();
    if (!edgeServerCheck) throw new AppError('Edge server not found', 404);

    const isMember = edgeServerCheck.trustedUsers.some((uid) => uid.equals(targetUserId));
    if (!isMember) {
        throw new AppError('User is not assigned to this edge server', 404);
    }

    // Atomic $pull prevents race conditions on concurrent unbind requests
    const updated = await EdgeServer.findByIdAndUpdate(
        edgeId,
        { $pull: { trustedUsers: targetUserId } },
        { new: true },
    ).exec();

    if (!updated) throw new AppError('Edge server not found', 404);
    return updated;
}

/**
 * Ping check: returns online state and last seen timestamp.
 *
 * Uses in-memory `lastSeenRegistry` (updated by WebSocket handler) to avoid
 * HTTP round-trips to the edge device. Edge is considered online if its last
 * heartbeat arrived less than PING_THRESHOLD_MS (30s) ago.
 *
 * @param edgeIdStr  EdgeServer._id as string
 */
async function pingEdgeServer(
    edgeIdStr: string,
): Promise<{ online: boolean; lastSeen: Date | null }> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');

    const edgeServer = await EdgeServer.findById(edgeId).select('_id lastSeen').exec();
    if (!edgeServer) throw new AppError('Edge server not found', 404);

    // Prefer in-memory timestamp (more fresh) over persisted DB value
    const inMemoryTs = lastSeenRegistry.get(edgeIdStr);
    const now = Date.now();

    if (inMemoryTs !== undefined) {
        const online = now - inMemoryTs < PING_THRESHOLD_MS;
        return { online, lastSeen: new Date(inMemoryTs) };
    }

    // Fall back to persisted lastSeen (may be stale from previous process)
    if (edgeServer.lastSeen) {
        const online = now - edgeServer.lastSeen.getTime() < PING_THRESHOLD_MS;
        return { online, lastSeen: edgeServer.lastSeen };
    }

    return { online: false, lastSeen: null };
}

// ── Export ────────────────────────────────────────────────────────────────

export interface EdgeCatalogEntry {
    edgeServerId: string;
    sourceId: string | null;
    deviceId: string;
    metric: string;
    label: string;
}

function buildCatalogLabel(sourceId: string | null, deviceId: string, metric: string): string {
    const sourcePart = sourceId && sourceId.trim().length > 0 ? sourceId : 'unknown-source';
    return `${sourcePart} / ${deviceId} / ${metric}`;
}

/**
 * Returns telemetry-derived catalog entries for a trusted user on one edge server.
 * Catalog is deduplicated by sourceId + deviceId + metric and sorted for stable UI rendering.
 */
async function getCatalogForUser(edgeIdStr: string, userIdStr: string): Promise<EdgeCatalogEntry[]> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const userId = toObjectId(userIdStr, 'userId');

    const edgeServer = await EdgeServer.findById(edgeId)
        .select('trustedUsers')
        .lean<{ trustedUsers: mongoose.Types.ObjectId[] }>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    const isTrusted = edgeServer.trustedUsers.some((uid) => uid.equals(userId));
    if (!isTrusted) {
        throw new AppError('Edge server is not in user trusted list (FR-8)', 403);
    }

    const deduplicated = await Telemetry.aggregate<{
        sourceId?: string | null;
        deviceId: string;
        metric: string;
    }>([
        {
            $match: {
                'metadata.edgeId': edgeIdStr,
                $or: [
                    { rollup: { $exists: true } },
                    // Compatibility with legacy telemetry documents before one-time reset.
                    { value: { $exists: true } },
                ],
            },
        },
        {
            $group: {
                _id: {
                    sourceId: '$metadata.sourceId',
                    deviceId: '$metadata.deviceId',
                    metric: '$metric',
                },
            },
        },
        {
            $project: {
                _id: 0,
                sourceId: '$_id.sourceId',
                deviceId: '$_id.deviceId',
                metric: '$_id.metric',
            },
        },
        { $sort: { sourceId: 1, deviceId: 1, metric: 1 } },
    ]).exec();

    return deduplicated.map((entry) => {
        const sourceId =
            typeof entry.sourceId === 'string' && entry.sourceId.trim().length > 0
                ? entry.sourceId
                : null;

        return {
            edgeServerId: edgeIdStr,
            sourceId,
            deviceId: entry.deviceId,
            metric: entry.metric,
            label: buildCatalogLabel(sourceId, entry.deviceId, entry.metric),
        };
    });
}

export const EdgeServersService = {
    register,
    listForUser,
    listAll,
    listAllForAdmin,
    assignUserToEdge,
    removeUserFromEdge,
    pingEdgeServer,
    getCatalogForUser,
};
