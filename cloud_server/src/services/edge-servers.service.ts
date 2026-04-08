import mongoose from 'mongoose';
import {
    EdgeServer,
    type EdgeAvailabilitySnapshot,
    type EdgeLifecycleState,
    type EdgeOnboardingPackageMetadata,
    type EdgePersistentCredentialMetadata,
    type IEdgeServer,
    type OnboardingPackageStatus,
} from '../models/EdgeServer';
import { User } from '../models/User';
import { Telemetry } from '../models/Telemetry';
import { AppError } from '../api/middlewares/error.middleware';

// ── Constants ─────────────────────────────────────────────────────────────

/** Max trusted edge servers for FREE tier (FR-2b). */
export const FREE_EDGE_SERVER_QUOTA = 1;

/** Online threshold: edge is considered online if the latest heartbeat is recent enough. */
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
 * Updates in-memory registry and persists only canonical availability timestamp.
 * The persisted timestamp lives in canonical `availability.lastSeenAt`.
 */
export function updateLastSeen(edgeId: string): void {
    const observedAtMs = Date.now();
    const observedAt = new Date(observedAtMs);
    lastSeenRegistry.set(edgeId, observedAtMs);

    void EdgeServer.updateOne(
        { _id: edgeId },
        {
            $set: {
                'availability.online': true,
                'availability.lastSeenAt': observedAt,
            },
        },
    )
        .exec()
        .catch((error) => {
            console.error(`[edge-last-seen] Failed to persist heartbeat for edge ${edgeId}:`, error);
        });
}

export async function markEdgeOffline(edgeId: string): Promise<void> {
    lastSeenRegistry.delete(edgeId);

    await EdgeServer.updateOne(
        { _id: edgeId },
        {
            $set: {
                'availability.online': false,
            },
        },
    ).exec();
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

function asNullableDate(value: Date | null | undefined): Date | null {
    return value instanceof Date ? value : null;
}

function resolveAvailabilityLastSeenAt(value?: Date | null): Date | null {
    return asNullableDate(value);
}

function isHeartbeatFresh(lastSeenAt: Date | null, nowMs: number): boolean {
    return Boolean(lastSeenAt && nowMs - lastSeenAt.getTime() < PING_THRESHOLD_MS);
}

function getCurrentAvailabilitySnapshot(
    edgeId: string,
    availability?: EdgeAvailabilitySnapshot,
    nowMs: number = Date.now(),
): EdgeAvailabilitySnapshot {
    const persistedLastSeenAt = resolveAvailabilityLastSeenAt(availability?.lastSeenAt ?? null);
    const inMemoryTs = lastSeenRegistry.get(edgeId);

    if (inMemoryTs !== undefined && nowMs - inMemoryTs < PING_THRESHOLD_MS) {
        return {
            online: true,
            lastSeenAt: new Date(inMemoryTs),
        };
    }

    if (availability?.online === true && isHeartbeatFresh(persistedLastSeenAt, nowMs)) {
        return {
            online: true,
            lastSeenAt: persistedLastSeenAt,
        };
    }

    return {
        online: false,
        lastSeenAt: persistedLastSeenAt,
    };
}

function hasUsablePersistentCredential(
    persistentCredential: EdgePersistentCredentialMetadata | null | undefined,
    options?: { requireSecretHash?: boolean },
): boolean {
    const requireSecretHash = options?.requireSecretHash ?? true;

    return Boolean(
        persistentCredential &&
            Number.isInteger(persistentCredential.version) &&
            persistentCredential.version > 0 &&
            (!requireSecretHash ||
                (typeof persistentCredential.secretHash === 'string' &&
                    persistentCredential.secretHash.trim().length > 0)) &&
            persistentCredential.revokedAt === null,
    );
}

function isTelemetryReadyEdge(input: Pick<EdgeProjectionInput, 'lifecycleState' | 'persistentCredential'>): boolean {
    return (
        input.lifecycleState === 'Active' &&
        hasUsablePersistentCredential(input.persistentCredential, { requireSecretHash: false })
    );
}

type AdminProjectionOnboardingPackage = {
    credentialId: string;
    status: OnboardingPackageStatus;
    issuedAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
    displayHint: string | null;
};

export interface AdminEdgeProjection {
    _id: string;
    name: string;
    lifecycleState: EdgeLifecycleState;
    isTelemetryReady: boolean;
    availability: EdgeAvailabilitySnapshot;
    trustedUsers: unknown[];
    createdBy: unknown | null;
    currentOnboardingPackage: AdminProjectionOnboardingPackage | null;
    persistentCredentialVersion: number | null;
    lastLifecycleEventAt: Date | null;
}

export interface TelemetryReadyEdgeProjection {
    _id: string;
    name: string;
    lifecycleState: 'Active';
    availability: EdgeAvailabilitySnapshot;
}

type EdgeProjectionInput = {
    _id: mongoose.Types.ObjectId | string;
    name: string;
    lifecycleState: EdgeLifecycleState;
    availability?: EdgeAvailabilitySnapshot;
    trustedUsers?: unknown[];
    createdBy?: unknown;
    currentOnboardingPackage?: EdgeOnboardingPackageMetadata | null;
    persistentCredential?: EdgePersistentCredentialMetadata | null;
    lastLifecycleEventAt?: Date | null;
};

function toIdString(id: mongoose.Types.ObjectId | string): string {
    return typeof id === 'string' ? id : id.toString();
}

function normalizeAvailabilitySnapshot(input: EdgeProjectionInput): EdgeAvailabilitySnapshot {
    return getCurrentAvailabilitySnapshot(toIdString(input._id), input.availability);
}

function maskOnboardingPackage(
    pkg?: EdgeOnboardingPackageMetadata | null,
): AdminProjectionOnboardingPackage | null {
    if (!pkg) return null;
    return {
        credentialId: pkg.credentialId,
        status: pkg.status,
        issuedAt: pkg.issuedAt,
        expiresAt: pkg.expiresAt,
        usedAt: pkg.usedAt ?? null,
        displayHint: pkg.displayHint ?? null,
    };
}

export function mapEdgeToAdminProjection(input: EdgeProjectionInput): AdminEdgeProjection {
    return {
        _id: toIdString(input._id),
        name: input.name,
        lifecycleState: input.lifecycleState,
        isTelemetryReady: isTelemetryReadyEdge(input),
        availability: normalizeAvailabilitySnapshot(input),
        trustedUsers: input.trustedUsers ?? [],
        createdBy: input.createdBy ?? null,
        currentOnboardingPackage: maskOnboardingPackage(input.currentOnboardingPackage),
        persistentCredentialVersion: input.persistentCredential?.version ?? null,
        lastLifecycleEventAt: input.lastLifecycleEventAt ?? null,
    };
}

export function mapEdgeToTelemetryReadyProjection(
    input: Pick<EdgeProjectionInput, '_id' | 'name' | 'lifecycleState' | 'availability' | 'persistentCredential'>,
): TelemetryReadyEdgeProjection | null {
    if (!isTelemetryReadyEdge(input)) {
        return null;
    }

    return {
        _id: toIdString(input._id),
        name: input.name,
        lifecycleState: 'Active',
        availability: normalizeAvailabilitySnapshot(input),
    };
}

// ── Service methods ───────────────────────────────────────────────────────

/**
 * Returns all EdgeServers where the given userId is in trustedUsers.
 * Regular users only see telemetry-ready trusted servers.
 */
async function listForUser(userIdStr: string): Promise<TelemetryReadyEdgeProjection[]> {
    const userId = toObjectId(userIdStr, 'userId');
    const edgeServers = await EdgeServer.find({
        trustedUsers: userId,
        lifecycleState: 'Active',
        'persistentCredential.version': { $gte: 1 },
        'persistentCredential.secretHash': { $exists: true, $type: 'string' },
        'persistentCredential.revokedAt': null,
    })
        .select('_id name lifecycleState availability persistentCredential.version persistentCredential.revokedAt persistentCredential.secretHash')
        .lean<Array<Parameters<typeof mapEdgeToTelemetryReadyProjection>[0]>>()
        .exec();

    const projections: TelemetryReadyEdgeProjection[] = [];
    for (const edgeServer of edgeServers) {
        const projection = mapEdgeToTelemetryReadyProjection(edgeServer);
        if (projection) {
            projections.push(projection);
        }
    }

    return projections;
}

/**
 * Returns all EdgeServers (internal use — no population).
 */
async function listAll(): Promise<IEdgeServer[]> {
    return EdgeServer.find().exec();
}

/**
 * Returns Admin Fleet projection with masked onboarding metadata.
 * Secret hashes are excluded at query level and never exposed by mapping.
 */
async function listAllForAdmin(): Promise<AdminEdgeProjection[]> {
    const edgeServers = await EdgeServer.find()
        .select('-currentOnboardingPackage.secretHash -persistentCredential.secretHash')
        .populate('trustedUsers', 'email role subscriptionTier')
        .populate('createdBy', 'email')
        .lean<Array<Parameters<typeof mapEdgeToAdminProjection>[0]>>()
        .exec();

    return edgeServers.map((edgeServer) => mapEdgeToAdminProjection(edgeServer));
}

async function getAdminEdgeById(edgeIdStr: string): Promise<AdminEdgeProjection> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const edgeServer = await EdgeServer.findById(edgeId)
        .select('-currentOnboardingPackage.secretHash -persistentCredential.secretHash')
        .populate('trustedUsers', 'email role subscriptionTier')
        .populate('createdBy', 'email')
        .lean<Parameters<typeof mapEdgeToAdminProjection>[0] | null>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    return mapEdgeToAdminProjection(edgeServer);
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
): Promise<{ online: boolean; lastSeenAt: Date | null }> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');

    const edgeServer = await EdgeServer.findById(edgeId).select('_id availability').exec();
    if (!edgeServer) throw new AppError('Edge server not found', 404);

    return getCurrentAvailabilitySnapshot(edgeIdStr, edgeServer.availability);
}

// ── Export ────────────────────────────────────────────────────────────────

export interface EdgeCatalogEntry {
    edgeServerId: string;
    deviceId: string;
    metric: string;
    label: string;
}

function buildCatalogLabel(deviceId: string, metric: string): string {
    return `${deviceId} / ${metric}`;
}

/**
 * Returns telemetry-derived catalog entries for a trusted user on one edge server.
 * Catalog is deduplicated by deviceId + metric and sorted for stable UI rendering.
 */
async function getCatalogForUser(edgeIdStr: string, userIdStr: string): Promise<EdgeCatalogEntry[]> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const userId = toObjectId(userIdStr, 'userId');

    const edgeServer = await EdgeServer.findById(edgeId)
        .select(
            'trustedUsers lifecycleState persistentCredential.version persistentCredential.revokedAt persistentCredential.secretHash',
        )
        .lean<{
            trustedUsers: mongoose.Types.ObjectId[];
            lifecycleState: EdgeLifecycleState;
            persistentCredential?: EdgePersistentCredentialMetadata | null;
        }>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    const isTrusted = edgeServer.trustedUsers.some((uid) => uid.equals(userId));
    if (!isTrusted) {
        throw new AppError('Edge server is not in user trusted list (FR-8)', 403);
    }

    if (
        edgeServer.lifecycleState !== 'Active' ||
        !hasUsablePersistentCredential(edgeServer.persistentCredential ?? null)
    ) {
        throw new AppError('Edge server is not telemetry-ready (Active lifecycle required)', 409);
    }

    const deduplicated = await Telemetry.aggregate<{
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
                    deviceId: '$metadata.deviceId',
                    metric: '$metric',
                },
            },
        },
        {
            $project: {
                _id: 0,
                deviceId: '$_id.deviceId',
                metric: '$_id.metric',
            },
        },
        { $sort: { deviceId: 1, metric: 1 } },
    ]).exec();

    return deduplicated.map((entry) => ({
        edgeServerId: edgeIdStr,
        deviceId: entry.deviceId,
        metric: entry.metric,
        label: buildCatalogLabel(entry.deviceId, entry.metric),
    }));
}

export const EdgeServersService = {
    listForUser,
    listAll,
    listAllForAdmin,
    getAdminEdgeById,
    assignUserToEdge,
    removeUserFromEdge,
    pingEdgeServer,
    markEdgeOffline,
    getCatalogForUser,
    mapEdgeToAdminProjection,
    mapEdgeToTelemetryReadyProjection,
};
