import mongoose from 'mongoose';

import { AppError } from '../api/middlewares/error.middleware';
import { AlarmIncident, type IAlarmIncident } from '../models/AlarmIncident';
import { EdgeServer } from '../models/EdgeServer';
import type {
    AlarmEventPayloadDto,
    AlarmIncidentLifecycleState,
    AlarmIncidentListOrder,
    AlarmIncidentListQueryDto,
    AlarmIncidentListResponseDto,
    AlarmIncidentListSort,
    AlarmIncidentListState,
    AlarmIncidentProjectionDto,
} from '../types';
import {
    ALARM_INCIDENT_LIST_DEFAULT_LIMIT,
    ALARM_INCIDENT_LIST_DEFAULT_ORDER,
    ALARM_INCIDENT_LIST_DEFAULT_PAGE,
    ALARM_INCIDENT_LIST_DEFAULT_SORT,
    ALARM_INCIDENT_LIST_DEFAULT_STATE,
    ALARM_INCIDENT_LIST_MAX_LIMIT,
    ALARM_INCIDENT_LIST_ORDERS,
    ALARM_INCIDENT_LIST_SORTS,
    ALARM_INCIDENT_LIST_STATES,
} from '../types';

export interface AlarmIncidentIdentity {
    edgeId: string | mongoose.Types.ObjectId;
    ruleId: string;
    deviceId: string;
    metric: string;
}

export interface AlarmIncidentAckInput {
    edgeId: string | mongoose.Types.ObjectId;
    incidentId: string | mongoose.Types.ObjectId;
    acknowledgedBy: string | mongoose.Types.ObjectId;
}

export interface TrustedAlarmIncidentAckInput {
    edgeId: string;
    incidentId: string;
    userId: string;
}

export interface AlarmIncidentListQueryInput {
    state?: unknown;
    page?: unknown;
    limit?: unknown;
    sort?: unknown;
    order?: unknown;
}

export interface TrustedAlarmIncidentListInput {
    edgeId: string;
    userId: string;
    query?: AlarmIncidentListQueryInput;
}

function toObjectId(value: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId | null {
    if (value instanceof mongoose.Types.ObjectId) {
        return value;
    }

    if (!mongoose.isValidObjectId(value)) {
        return null;
    }

    return new mongoose.Types.ObjectId(value);
}

function toIdString(value: string | mongoose.Types.ObjectId | null): string | null {
    if (value === null) {
        return null;
    }

    return value instanceof mongoose.Types.ObjectId ? value.toHexString() : String(value);
}

function getLifecycleState(incident: Pick<IAlarmIncident, 'isActive' | 'isAcknowledged'>): AlarmIncidentLifecycleState {
    if (incident.isActive && incident.isAcknowledged) {
        return 'active_acknowledged';
    }

    if (incident.isActive) {
        return 'active_unacknowledged';
    }

    return incident.isAcknowledged ? 'closed' : 'cleared_unacknowledged';
}

function getSingleQueryValue(value: unknown, fieldName: string): unknown {
    if (Array.isArray(value)) {
        throw new AppError(`Invalid ${fieldName}`, 400);
    }

    return value;
}

function parseEnumValue<T extends string>(
    value: unknown,
    fieldName: string,
    allowed: readonly T[],
    defaultValue: T,
): T {
    const normalized = getSingleQueryValue(value, fieldName);
    if (normalized === undefined) {
        return defaultValue;
    }

    if (typeof normalized !== 'string' || !allowed.includes(normalized as T)) {
        throw new AppError(`Unsupported ${fieldName}`, 400);
    }

    return normalized as T;
}

function parsePositiveInteger(value: unknown, fieldName: string, defaultValue: number): number {
    const normalized = getSingleQueryValue(value, fieldName);
    if (normalized === undefined) {
        return defaultValue;
    }

    if (
        (typeof normalized !== 'string' && typeof normalized !== 'number') ||
        normalized === '' ||
        !Number.isInteger(Number(normalized))
    ) {
        throw new AppError(`Invalid ${fieldName}`, 400);
    }

    const parsed = Number(normalized);
    if (parsed < 1) {
        throw new AppError(`Invalid ${fieldName}`, 400);
    }

    return parsed;
}

export function parseAlarmIncidentListQuery(
    query: AlarmIncidentListQueryInput = {},
): AlarmIncidentListQueryDto {
    const parsed = {
        state: parseEnumValue<AlarmIncidentListState>(
            query.state,
            'state',
            ALARM_INCIDENT_LIST_STATES,
            ALARM_INCIDENT_LIST_DEFAULT_STATE,
        ),
        page: parsePositiveInteger(query.page, 'page', ALARM_INCIDENT_LIST_DEFAULT_PAGE),
        limit: parsePositiveInteger(query.limit, 'limit', ALARM_INCIDENT_LIST_DEFAULT_LIMIT),
        sort: parseEnumValue<AlarmIncidentListSort>(
            query.sort,
            'sort',
            ALARM_INCIDENT_LIST_SORTS,
            ALARM_INCIDENT_LIST_DEFAULT_SORT,
        ),
        order: parseEnumValue<AlarmIncidentListOrder>(
            query.order,
            'order',
            ALARM_INCIDENT_LIST_ORDERS,
            ALARM_INCIDENT_LIST_DEFAULT_ORDER,
        ),
    };

    if (parsed.limit > ALARM_INCIDENT_LIST_MAX_LIMIT) {
        throw new AppError(`Invalid limit: maximum is ${ALARM_INCIDENT_LIST_MAX_LIMIT}`, 400);
    }

    return parsed;
}

function normalizeComparableTimeMs(value: Date | string | number | null | undefined): number {
    if (value === null || value === undefined) {
        return Number.NEGATIVE_INFINITY;
    }

    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function getAlarmIncidentLatestRowTimeMs(
    incident: Pick<IAlarmIncident, 'updatedAt' | 'acknowledgedAt' | 'clearedAt' | 'latestDetectedAt' | 'activatedAt'>,
): number {
    return Math.max(
        normalizeComparableTimeMs(incident.updatedAt),
        normalizeComparableTimeMs(incident.acknowledgedAt),
        normalizeComparableTimeMs(incident.clearedAt),
        normalizeComparableTimeMs(incident.latestDetectedAt),
        normalizeComparableTimeMs(incident.activatedAt),
    );
}

function compareAlarmIncidentsByLatest(
    left: IAlarmIncident,
    right: IAlarmIncident,
    order: AlarmIncidentListOrder,
): number {
    const latestDelta = getAlarmIncidentLatestRowTimeMs(left) - getAlarmIncidentLatestRowTimeMs(right);
    if (latestDelta !== 0) {
        return order === 'asc' ? latestDelta : -latestDelta;
    }

    const leftId = left._id.toHexString();
    const rightId = right._id.toHexString();
    return leftId.localeCompare(rightId);
}

function buildAlarmIncidentListFilter(
    edgeId: mongoose.Types.ObjectId,
    state: AlarmIncidentListState,
): Record<string, unknown> {
    const filter: Record<string, unknown> = { edgeId };
    if (state === 'unclosed') {
        filter.$or = [{ isActive: true }, { isAcknowledged: false }];
    }

    return filter;
}

function getReusableFilter(payload: AlarmEventPayloadDto): Record<string, unknown> | null {
    const edgeId = toObjectId(payload.edgeId);
    if (!edgeId) {
        return null;
    }

    return {
        edgeId,
        ruleId: payload.rule.ruleId,
        deviceId: payload.deviceId,
        metric: payload.metric,
        $or: [{ isActive: true }, { isAcknowledged: false }],
    };
}

function isDuplicateKeyError(error: unknown): boolean {
    return Boolean(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: unknown }).code === 11000,
    );
}

function logRuleRevisionDrift(
    context: 'active' | 'clear',
    incident: IAlarmIncident,
    payload: AlarmEventPayloadDto,
): void {
    if (incident.rule.ruleRevision === payload.rule.ruleRevision) {
        return;
    }

    console.warn(
        `[alarm-incidents] ${context} ruleRevision drift for edge=${payload.edgeId} rule=${payload.rule.ruleId} device=${payload.deviceId} metric=${payload.metric}: incident=${incident.rule.ruleRevision} event=${payload.rule.ruleRevision}`,
    );
}

export function projectAlarmIncident(incident: IAlarmIncident): AlarmIncidentProjectionDto {
    return {
        incidentId: incident._id.toHexString(),
        edgeId: incident.edgeId.toHexString(),
        sourceId: incident.sourceId,
        deviceId: incident.deviceId,
        metric: incident.metric,
        ruleId: incident.ruleId,
        lifecycleState: getLifecycleState(incident),
        isActive: incident.isActive,
        isAcknowledged: incident.isAcknowledged,
        activatedAt: incident.activatedAt.toISOString(),
        clearedAt: incident.clearedAt?.toISOString() ?? null,
        acknowledgedAt: incident.acknowledgedAt?.toISOString() ?? null,
        acknowledgedBy: toIdString(incident.acknowledgedBy),
        latestValue: incident.latestValue,
        latestTs: incident.latestTs,
        latestDetectedAt: incident.latestDetectedAt,
        rule: {
            ruleId: incident.rule.ruleId,
            ruleRevision: incident.rule.ruleRevision,
            conditionType: incident.rule.conditionType,
            triggerThreshold: incident.rule.triggerThreshold,
            clearThreshold: incident.rule.clearThreshold,
            expectedValue: incident.rule.expectedValue,
            severity: incident.rule.severity,
            label: incident.rule.label,
        },
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
    };
}

export async function findReusableAlarmIncident(
    identity: AlarmIncidentIdentity,
): Promise<IAlarmIncident | null> {
    const edgeId = toObjectId(identity.edgeId);
    if (!edgeId) {
        return null;
    }

    return await AlarmIncident.findOne({
        edgeId,
        ruleId: identity.ruleId,
        deviceId: identity.deviceId,
        metric: identity.metric,
        $or: [{ isActive: true }, { isAcknowledged: false }],
    })
        .sort({ activatedAt: -1, createdAt: -1 })
        .exec();
}

export async function persistActiveAlarmIncident(
    payload: AlarmEventPayloadDto,
): Promise<IAlarmIncident | null> {
    const reusableFilter = getReusableFilter(payload);
    if (!reusableFilter) {
        return null;
    }

    const now = new Date();
    const reusableUpdate = {
        $set: {
            sourceId: payload.sourceId,
            latestValue: payload.value,
            latestTs: payload.ts,
            latestDetectedAt: payload.detectedAt,
            isActive: true,
            clearedAt: null,
        },
    };
    const reusableOptions = {
        new: true,
        sort: { activatedAt: -1, createdAt: -1 },
        runValidators: true,
    };

    const reusable = await AlarmIncident.findOneAndUpdate(
        reusableFilter,
        reusableUpdate,
        reusableOptions,
    ).exec();
    if (reusable) {
        logRuleRevisionDrift('active', reusable, payload);
        return reusable;
    }

    try {
        return await AlarmIncident.create({
            edgeId: reusableFilter.edgeId,
            sourceId: payload.sourceId,
            deviceId: payload.deviceId,
            metric: payload.metric,
            ruleId: payload.rule.ruleId,
            latestValue: payload.value,
            latestTs: payload.ts,
            latestDetectedAt: payload.detectedAt,
            rule: payload.rule,
            isActive: true,
            isAcknowledged: false,
            activatedAt: now,
            clearedAt: null,
            acknowledgedAt: null,
            acknowledgedBy: null,
        });
    } catch (error) {
        if (!isDuplicateKeyError(error)) {
            throw error;
        }

        const racedReusable = await AlarmIncident.findOneAndUpdate(
            reusableFilter,
            reusableUpdate,
            reusableOptions,
        ).exec();
        if (racedReusable) {
            logRuleRevisionDrift('active', racedReusable, payload);
        }

        return racedReusable;
    }
}

export async function persistClearAlarmIncident(
    payload: AlarmEventPayloadDto,
): Promise<IAlarmIncident | null> {
    const reusableFilter = getReusableFilter(payload);
    if (!reusableFilter) {
        return null;
    }

    const cleared = await AlarmIncident.findOneAndUpdate(
        reusableFilter,
        {
            $set: {
                latestValue: payload.value,
                latestTs: payload.ts,
                latestDetectedAt: payload.detectedAt,
                isActive: false,
                clearedAt: new Date(),
            },
        },
        {
            new: true,
            sort: { activatedAt: -1, createdAt: -1 },
            runValidators: true,
        },
    ).exec();

    if (!cleared) {
        console.warn(
            `[alarm-incidents] Ignored clear for edge=${payload.edgeId} rule=${payload.rule.ruleId} device=${payload.deviceId} metric=${payload.metric}: no reusable incident`,
        );
    } else {
        logRuleRevisionDrift('clear', cleared, payload);
    }

    return cleared;
}

export async function acknowledgeAlarmIncident(
    input: AlarmIncidentAckInput,
): Promise<IAlarmIncident | null> {
    const edgeId = toObjectId(input.edgeId);
    const incidentId = toObjectId(input.incidentId);
    const acknowledgedBy = toObjectId(input.acknowledgedBy);

    if (!edgeId || !incidentId || !acknowledgedBy) {
        return null;
    }

    const ownershipFilter = {
        _id: incidentId,
        edgeId,
    };

    const acknowledged = await AlarmIncident.findOneAndUpdate(
        {
            ...ownershipFilter,
            isAcknowledged: false,
        },
        {
            $set: {
                isAcknowledged: true,
                acknowledgedAt: new Date(),
                acknowledgedBy,
            },
        },
        {
            new: true,
            runValidators: true,
        },
    ).exec();

    if (acknowledged) {
        return acknowledged;
    }

    return await AlarmIncident.findOne(ownershipFilter).exec();
}

export async function acknowledgeTrustedAlarmIncident(
    input: TrustedAlarmIncidentAckInput,
): Promise<IAlarmIncident> {
    const edgeId = toObjectId(input.edgeId);
    const incidentId = toObjectId(input.incidentId);
    const userId = toObjectId(input.userId);

    if (!edgeId) {
        throw new AppError('Invalid edgeId', 400);
    }

    if (!incidentId) {
        throw new AppError('Invalid incidentId', 400);
    }

    if (!userId) {
        throw new AppError('Invalid userId', 400);
    }

    const edgeServer = await EdgeServer.findById(edgeId)
        .select('trustedUsers')
        .lean<{ trustedUsers: mongoose.Types.ObjectId[] } | null>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    const isTrusted = edgeServer.trustedUsers.some((trustedUserId) => trustedUserId.equals(userId));
    if (!isTrusted) {
        throw new AppError('Access denied: user is not trusted for this edge server', 403);
    }

    const incident = await acknowledgeAlarmIncident({
        edgeId,
        incidentId,
        acknowledgedBy: userId,
    });

    if (!incident) {
        throw new AppError('Alarm incident not found', 404);
    }

    return incident;
}

export async function listTrustedAlarmIncidents(
    input: TrustedAlarmIncidentListInput,
): Promise<AlarmIncidentListResponseDto> {
    const edgeId = toObjectId(input.edgeId);
    const userId = toObjectId(input.userId);

    if (!edgeId) {
        throw new AppError('Invalid edgeId', 400);
    }

    if (!userId) {
        throw new AppError('Invalid userId', 400);
    }

    const edgeServer = await EdgeServer.findById(edgeId)
        .select('trustedUsers')
        .lean<{ trustedUsers: mongoose.Types.ObjectId[] } | null>()
        .exec();

    if (!edgeServer) {
        throw new AppError('Edge server not found', 404);
    }

    const isTrusted = edgeServer.trustedUsers.some((trustedUserId) => trustedUserId.equals(userId));
    if (!isTrusted) {
        throw new AppError('Access denied: user is not trusted for this edge server', 403);
    }

    const query = parseAlarmIncidentListQuery(input.query);
    const filter = buildAlarmIncidentListFilter(edgeId, query.state);
    const [total, incidents] = await Promise.all([
        AlarmIncident.countDocuments(filter).exec(),
        AlarmIncident.find(filter).exec(),
    ]);

    const offset = (query.page - 1) * query.limit;
    const pageIncidents = incidents
        .sort((left, right) => compareAlarmIncidentsByLatest(left, right, query.order))
        .slice(offset, offset + query.limit);

    return {
        incidents: pageIncidents.map(projectAlarmIncident),
        page: query.page,
        limit: query.limit,
        total,
        hasNextPage: offset + query.limit < total,
    };
}
