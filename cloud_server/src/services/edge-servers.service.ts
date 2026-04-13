import mongoose from 'mongoose';
import {
    EdgeServer,
    type EdgeAvailabilitySnapshot,
    type EdgeLifecycleState,
    type EdgePersistentCredentialMetadata,
    type IEdgeServer,
} from '../models/EdgeServer';
import { User } from '../models/User';
import { Telemetry } from '../models/Telemetry';
import { AppError } from '../api/middlewares/error.middleware';
import type {
    AdminEdgeServerRecord,
    EdgeAvailabilityRecord,
    EdgeStatusRecord,
    EdgeServerCreatedByRef,
    EdgeServerUserRef,
    EdgeCredentialIssueData,
    UserEdgeServerRecord,
} from '../types';
import {
    blockEdgeAggregate,
    generatePersistentCredentialSecret,
    hashPersistentCredentialSecret,
    registerEdgeAggregate,
    rotateEdgeCredentialAggregate,
    unblockEdgeAggregate,
    type EdgeLifecycleAggregateState,
} from './edge-lifecycle.domain';

export const FREE_EDGE_SERVER_QUOTA = 1;

const PING_THRESHOLD_MS = 3_000;

export const lastSeenRegistry = new Map<string, number>();

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

function toObjectId(id: string, label: string): mongoose.Types.ObjectId {
    if (!mongoose.isValidObjectId(id)) {
        throw new AppError(`Invalid ${label}`, 400);
    }
    return new mongoose.Types.ObjectId(id);
}

function toIdString(id: mongoose.Types.ObjectId | string): string {
    return typeof id === 'string' ? id : id.toString();
}

function requireCanonicalLifecycleState(
    lifecycleState: string | undefined,
    edgeId: string,
): 'Active' | 'Blocked' {
    if (lifecycleState === 'Active' || lifecycleState === 'Blocked') {
        return lifecycleState;
    }

    throw new AppError(
        `Edge ${edgeId} has unsupported lifecycle state "${lifecycleState ?? 'undefined'}"; remove stale legacy edge records from the database.`,
        500,
    );
}

async function ensureAdminExists(adminIdStr: string): Promise<mongoose.Types.ObjectId> {
    const adminId = toObjectId(adminIdStr, 'adminId');
    const admin = await User.findById(adminId).select('_id').lean().exec();
    if (!admin) {
        throw new AppError('Admin user not found', 404);
    }
    return adminId;
}

async function countUserEdgeServers(userId: mongoose.Types.ObjectId): Promise<number> {
    return EdgeServer.countDocuments({ trustedUsers: userId }).exec();
}

function asNullableDate(value: Date | null | undefined): Date | null {
    return value instanceof Date ? value : null;
}

function isHeartbeatFresh(lastSeenAt: Date | null, nowMs: number): boolean {
    return Boolean(lastSeenAt && nowMs - lastSeenAt.getTime() < PING_THRESHOLD_MS);
}

function getCurrentAvailabilitySnapshot(
    edgeId: string,
    availability?: EdgeAvailabilitySnapshot,
    nowMs: number = Date.now(),
): EdgeAvailabilitySnapshot {
    const persistedLastSeenAt = asNullableDate(availability?.lastSeenAt ?? null);
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

function hasCurrentPersistentCredential(
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
                    persistentCredential.secretHash.trim().length > 0)),
    );
}

type EdgeProjectionInput = {
    _id: mongoose.Types.ObjectId | string;
    name: string;
    lifecycleState: string | undefined;
    availability?: EdgeAvailabilitySnapshot;
    trustedUsers?: unknown[];
    createdBy?: unknown;
    persistentCredential?: EdgePersistentCredentialMetadata | null;
    lastLifecycleEventAt?: Date | null;
    createdAt?: Date | null;
};

export type AdminEdgeProjection = AdminEdgeServerRecord;
export type TelemetryReadyEdgeProjection = UserEdgeServerRecord;
export type AdminEdgeStatusProjection = EdgeStatusRecord;

function resolveCreatedAt(input: EdgeProjectionInput): Date {
    return asNullableDate(input.createdAt) ?? asNullableDate(input.lastLifecycleEventAt) ?? new Date(0);
}

function toIsoString(value: Date | null): string | null {
    return value ? value.toISOString() : null;
}

function normalizeAvailabilitySnapshot(input: EdgeProjectionInput): EdgeAvailabilityRecord {
    const availability = getCurrentAvailabilitySnapshot(toIdString(input._id), input.availability);

    return {
        online: availability.online,
        lastSeenAt: toIsoString(availability.lastSeenAt),
    };
}

function mapTrustedUserRef(input: unknown): string | EdgeServerUserRef {
    if (typeof input === 'string') {
        return input;
    }

    if (input instanceof mongoose.Types.ObjectId) {
        return input.toString();
    }

    if (input && typeof input === 'object' && '_id' in input) {
        const candidate = input as {
            _id: mongoose.Types.ObjectId | string;
            email?: unknown;
            role?: unknown;
            subscriptionTier?: unknown;
        };
        const mapped: EdgeServerUserRef = {
            _id: toIdString(candidate._id),
        };

        if (typeof candidate.email === 'string') {
            mapped.email = candidate.email;
        }
        if (candidate.role === 'ADMIN' || candidate.role === 'USER') {
            mapped.role = candidate.role;
        }
        if (candidate.subscriptionTier === 'FREE' || candidate.subscriptionTier === 'PRO') {
            mapped.subscriptionTier = candidate.subscriptionTier;
        }

        return mapped;
    }

    throw new AppError('Unsupported trustedUsers projection shape', 500);
}

function mapCreatedByRef(input: unknown): EdgeServerCreatedByRef | null {
    if (input === null || input === undefined) {
        return null;
    }

    if (typeof input === 'string' || input instanceof mongoose.Types.ObjectId) {
        return { _id: toIdString(input) };
    }

    if (input && typeof input === 'object' && '_id' in input) {
        const candidate = input as {
            _id: mongoose.Types.ObjectId | string;
            email?: unknown;
        };
        return {
            _id: toIdString(candidate._id),
            ...(typeof candidate.email === 'string' ? { email: candidate.email } : {}),
        };
    }

    throw new AppError('Unsupported createdBy projection shape', 500);
}

export function mapEdgeToAdminProjection(input: EdgeProjectionInput): AdminEdgeProjection {
    const edgeId = toIdString(input._id);

    return {
        _id: edgeId,
        name: input.name,
        trustedUsers: (input.trustedUsers ?? []).map((trustedUser) => mapTrustedUserRef(trustedUser)),
        createdBy: mapCreatedByRef(input.createdBy),
        lifecycleState: requireCanonicalLifecycleState(input.lifecycleState, edgeId),
        availability: normalizeAvailabilitySnapshot(input),
        persistentCredentialVersion: input.persistentCredential?.version ?? null,
        lastLifecycleEventAt: toIsoString(asNullableDate(input.lastLifecycleEventAt)),
        createdAt: resolveCreatedAt(input).toISOString(),
    };
}

export function mapEdgeToUserProjection(input: EdgeProjectionInput): UserEdgeServerRecord {
    const edgeId = toIdString(input._id);

    return {
        _id: edgeId,
        name: input.name,
        lifecycleState: requireCanonicalLifecycleState(input.lifecycleState, edgeId),
        availability: normalizeAvailabilitySnapshot(input),
        createdAt: resolveCreatedAt(input).toISOString(),
    };
}

export function mapEdgeToTelemetryReadyProjection(
    input: EdgeProjectionInput,
): TelemetryReadyEdgeProjection {
    return mapEdgeToUserProjection(input);
}

export function mapEdgeToStatusProjection(input: EdgeProjectionInput): AdminEdgeStatusProjection {
    const edgeId = toIdString(input._id);

    return {
        lifecycleState: requireCanonicalLifecycleState(input.lifecycleState, edgeId),
        availability: normalizeAvailabilitySnapshot(input),
    };
}

async function listForUser(userIdStr: string): Promise<UserEdgeServerRecord[]> {
    const userId = toObjectId(userIdStr, 'userId');
    const edgeServers = await EdgeServer.find({
        trustedUsers: userId,
    })
        .select('_id name lifecycleState availability createdAt')
        .sort({ createdAt: 1 })
        .lean<Array<EdgeProjectionInput>>()
        .exec();

    return edgeServers.map((edgeServer) => mapEdgeToUserProjection(edgeServer));
}

async function listAll(): Promise<IEdgeServer[]> {
    return EdgeServer.find().exec();
}

async function listAllForAdmin(): Promise<AdminEdgeProjection[]> {
    const edgeServers = await EdgeServer.find()
        .select('-persistentCredential.secretHash')
        .populate('trustedUsers', 'email role subscriptionTier')
        .populate('createdBy', 'email')
        .sort({ createdAt: 1 })
        .lean<Array<EdgeProjectionInput>>()
        .exec();

    return edgeServers.map((edgeServer) => mapEdgeToAdminProjection(edgeServer));
}

async function getAdminEdgeById(edgeIdStr: string): Promise<AdminEdgeProjection> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const edgeServer = await EdgeServer.findById(edgeId)
        .select('-persistentCredential.secretHash')
        .populate('trustedUsers', 'email role subscriptionTier')
        .populate('createdBy', 'email')
        .lean<EdgeProjectionInput | null>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    return mapEdgeToAdminProjection(edgeServer);
}

async function assignUserToEdge(edgeIdStr: string, targetUserIdStr: string): Promise<IEdgeServer> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const targetUserId = toObjectId(targetUserIdStr, 'targetUserId');

    const [edgeServer, targetUser] = await Promise.all([
        EdgeServer.findById(edgeId).exec(),
        User.findById(targetUserId).exec(),
    ]);

    if (!edgeServer) throw new AppError('Edge server not found', 404);
    if (!targetUser) throw new AppError('User not found', 404);

    const alreadyTrusted = edgeServer.trustedUsers.some((uid) => uid.equals(targetUserId));
    if (alreadyTrusted) {
        throw new AppError('User is already assigned to this edge server', 409);
    }

    if (targetUser.subscriptionTier === 'FREE') {
        const currentCount = await countUserEdgeServers(targetUserId);
        if (currentCount >= FREE_EDGE_SERVER_QUOTA) {
            throw new AppError(
                `FREE tier edge server quota (${FREE_EDGE_SERVER_QUOTA}) exceeded`,
                403,
            );
        }
    }

    const updated = await EdgeServer.findByIdAndUpdate(
        edgeId,
        { $addToSet: { trustedUsers: targetUserId } },
        { new: true },
    ).exec();

    if (!updated) throw new AppError('Edge server not found', 404);
    return updated;
}

async function removeUserFromEdge(edgeIdStr: string, targetUserIdStr: string): Promise<IEdgeServer> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const targetUserId = toObjectId(targetUserIdStr, 'targetUserId');

    const edgeServerCheck = await EdgeServer.findById(edgeId).select('trustedUsers').lean().exec();
    if (!edgeServerCheck) throw new AppError('Edge server not found', 404);

    const isMember = edgeServerCheck.trustedUsers.some((uid) => uid.equals(targetUserId));
    if (!isMember) {
        throw new AppError('User is not assigned to this edge server', 404);
    }

    const updated = await EdgeServer.findByIdAndUpdate(
        edgeId,
        { $pull: { trustedUsers: targetUserId } },
        { new: true },
    ).exec();

    if (!updated) throw new AppError('Edge server not found', 404);
    return updated;
}

async function pingEdgeServer(
    edgeIdStr: string,
): Promise<AdminEdgeStatusProjection> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const edgeServer = await EdgeServer.findById(edgeId)
        .select('_id lifecycleState availability')
        .lean<EdgeProjectionInput | null>()
        .exec();
    if (!edgeServer) throw new AppError('Edge server not found', 404);

    return mapEdgeToStatusProjection(edgeServer);
}

function toAggregateState(edge: IEdgeServer): EdgeLifecycleAggregateState {
    const edgeId = edge._id.toString();

    return {
        lifecycleState: requireCanonicalLifecycleState(edge.lifecycleState, edgeId),
        availability: edge.availability ?? { online: false, lastSeenAt: null },
        persistentCredential: edge.persistentCredential ?? null,
        lastLifecycleEventAt: asNullableDate(edge.lastLifecycleEventAt),
    };
}

function applyAggregateState(edge: IEdgeServer, next: EdgeLifecycleAggregateState): void {
    edge.lifecycleState = next.lifecycleState;
    edge.availability = next.availability;
    edge.persistentCredential = next.persistentCredential;
    edge.lastLifecycleEventAt = next.lastLifecycleEventAt;
}

async function registerEdgeServer(name: string, adminIdStr: string): Promise<EdgeCredentialIssueData> {
    const adminId = await ensureAdminExists(adminIdStr);
    const now = new Date();
    const initialSecret = generatePersistentCredentialSecret();
    const initialSecretHash = await hashPersistentCredentialSecret(initialSecret);
    const aggregate = registerEdgeAggregate({
        secretHash: initialSecretHash,
        now,
    });

    const edge = await EdgeServer.create({
        name,
        createdBy: adminId,
        trustedUsers: [],
        lifecycleState: aggregate.lifecycleState,
        availability: aggregate.availability,
        persistentCredential: aggregate.persistentCredential,
        lastLifecycleEventAt: aggregate.lastLifecycleEventAt,
    });

    return {
        edge: mapEdgeToAdminProjection(edge.toObject() as EdgeProjectionInput),
        persistentCredential: {
            edgeId: edge._id.toString(),
            credentialSecret: initialSecret,
            version: aggregate.persistentCredential?.version ?? 1,
            issuedAt: now.toISOString(),
            instructions:
                'Use this secret as the edge runtime persistent credential for trusted connects and reconnects.',
        },
    };
}

async function rotateEdgeCredential(edgeIdStr: string, adminIdStr: string): Promise<EdgeCredentialIssueData> {
    await ensureAdminExists(adminIdStr);
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const edge = await EdgeServer.findById(edgeId).exec();

    if (!edge) {
        throw new AppError('Edge server not found', 404);
    }

    if (requireCanonicalLifecycleState(edge.lifecycleState, edge._id.toString()) !== 'Active') {
        throw new AppError('Only Active edge servers can rotate credentials', 409);
    }

    const now = new Date();
    const nextSecret = generatePersistentCredentialSecret();
    const nextSecretHash = await hashPersistentCredentialSecret(nextSecret);
    const aggregate = rotateEdgeCredentialAggregate(toAggregateState(edge), {
        nextSecretHash,
        now,
    });

    applyAggregateState(edge, aggregate);
    await edge.save();

    return {
        edge: mapEdgeToAdminProjection(edge.toObject() as EdgeProjectionInput),
        persistentCredential: {
            edgeId: edge._id.toString(),
            credentialSecret: nextSecret,
            version: aggregate.persistentCredential?.version ?? 1,
            issuedAt: now.toISOString(),
            instructions:
                'Use this secret as the edge runtime persistent credential for trusted connects and reconnects.',
        },
    };
}

async function blockEdgeServer(edgeIdStr: string, adminIdStr: string): Promise<{ edge: AdminEdgeProjection }> {
    await ensureAdminExists(adminIdStr);
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const edge = await EdgeServer.findById(edgeId).exec();

    if (!edge) {
        throw new AppError('Edge server not found', 404);
    }

    if (requireCanonicalLifecycleState(edge.lifecycleState, edge._id.toString()) === 'Blocked') {
        throw new AppError('Edge server is already blocked', 409);
    }

    const aggregate = blockEdgeAggregate(toAggregateState(edge), {
        now: new Date(),
    });
    applyAggregateState(edge, aggregate);
    await edge.save();

    return {
        edge: mapEdgeToAdminProjection(edge.toObject() as EdgeProjectionInput),
    };
}

async function unblockEdgeServer(edgeIdStr: string, adminIdStr: string): Promise<EdgeCredentialIssueData> {
    await ensureAdminExists(adminIdStr);
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const edge = await EdgeServer.findById(edgeId).exec();

    if (!edge) {
        throw new AppError('Edge server not found', 404);
    }

    if (requireCanonicalLifecycleState(edge.lifecycleState, edge._id.toString()) !== 'Blocked') {
        throw new AppError('Only blocked edge servers can be unblocked', 409);
    }

    const now = new Date();
    const nextSecret = generatePersistentCredentialSecret();
    const nextSecretHash = await hashPersistentCredentialSecret(nextSecret);
    const aggregate = unblockEdgeAggregate(toAggregateState(edge), {
        nextSecretHash,
        now,
    });

    applyAggregateState(edge, aggregate);
    await edge.save();

    return {
        edge: mapEdgeToAdminProjection(edge.toObject() as EdgeProjectionInput),
        persistentCredential: {
            edgeId: edge._id.toString(),
            credentialSecret: nextSecret,
            version: aggregate.persistentCredential?.version ?? 1,
            issuedAt: now.toISOString(),
            instructions:
                'Use this secret as the edge runtime persistent credential for trusted connects and reconnects.',
        },
    };
}

export interface EdgeCatalogEntry {
    edgeServerId: string;
    deviceId: string;
    metric: string;
    label: string;
}

function buildCatalogLabel(deviceId: string, metric: string): string {
    return `${deviceId} / ${metric}`;
}

async function getCatalogForUser(edgeIdStr: string, userIdStr: string): Promise<EdgeCatalogEntry[]> {
    const edgeId = toObjectId(edgeIdStr, 'edgeId');
    const userId = toObjectId(userIdStr, 'userId');

    const edgeServer = await EdgeServer.findById(edgeId)
        .select('trustedUsers lifecycleState persistentCredential')
        .lean<{
            trustedUsers: mongoose.Types.ObjectId[];
            lifecycleState: EdgeLifecycleState;
            persistentCredential?: EdgePersistentCredentialMetadata | null;
        } | null>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    const isTrusted = edgeServer.trustedUsers.some((uid) => uid.equals(userId));
    if (!isTrusted) {
        throw new AppError('Edge server is not in user trusted list (FR-8)', 403);
    }

    if (
        requireCanonicalLifecycleState(edgeServer.lifecycleState, edgeIdStr) !== 'Active' ||
        !hasCurrentPersistentCredential(edgeServer.persistentCredential ?? null)
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
                $or: [{ rollup: { $exists: true } }, { value: { $exists: true } }],
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
    registerEdgeServer,
    rotateEdgeCredential,
    blockEdgeServer,
    unblockEdgeServer,
    assignUserToEdge,
    removeUserFromEdge,
    pingEdgeServer,
    markEdgeOffline,
    getCatalogForUser,
    mapEdgeToAdminProjection,
    mapEdgeToUserProjection,
    mapEdgeToTelemetryReadyProjection,
    mapEdgeToStatusProjection,
};
