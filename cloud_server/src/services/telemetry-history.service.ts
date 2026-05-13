import mongoose, { type PipelineStage } from 'mongoose';

import { AppError } from '../api/middlewares/error.middleware';
import { EdgeServer } from '../models/EdgeServer';
import { Telemetry } from '../models/Telemetry';
import {
    TELEMETRY_HISTORY_DEFAULT_MAX_POINTS,
    TELEMETRY_HISTORY_MAX_POINTS,
    TELEMETRY_HISTORY_NUMERIC_ROLLUP_KIND,
    TELEMETRY_HISTORY_QUERY_FIELDS,
    TELEMETRY_HISTORY_RETENTION_DAYS,
    TELEMETRY_HISTORY_RETENTION_MS,
    type TelemetryHistoryPointDto,
    type TelemetryHistoryQueryDto,
    type TelemetryHistoryResponseDto,
} from '../types';

export interface TelemetryHistoryQueryInput {
    edgeId?: unknown;
    deviceId?: unknown;
    metric?: unknown;
    date_start?: unknown;
    date_end?: unknown;
    maxPoints?: unknown;
}

export interface TrustedTelemetryHistoryAccessInput {
    edgeId: string;
    userId: string;
}

export interface TrustedTelemetryHistoryInput {
    userId: string;
    query?: TelemetryHistoryQueryInput;
}

interface RawTelemetryHistoryPoint {
    timeStart: Date | string | number;
    timeEnd: Date | string | number;
    pointTime: Date | string | number;
    min: number;
    max: number;
    avg: number;
    last: number;
    count: number;
}

const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const METRIC_PATTERN = /^[A-Za-z0-9._:/%-]+$/;

function getSingleQueryValue(value: unknown, fieldName: string): unknown {
    if (Array.isArray(value)) {
        throw new AppError(`Invalid ${fieldName}`, 400);
    }

    return value;
}

function parseRequiredString(value: unknown, fieldName: string): string {
    const normalized = getSingleQueryValue(value, fieldName);
    if (typeof normalized !== 'string') {
        throw new AppError(`${fieldName} is required`, 400);
    }

    const trimmed = normalized.trim();
    if (trimmed.length === 0) {
        throw new AppError(`${fieldName} is required`, 400);
    }

    return trimmed;
}

function parseObjectIdString(value: unknown, fieldName: string): string {
    const parsed = parseRequiredString(value, fieldName);
    if (!mongoose.isValidObjectId(parsed)) {
        throw new AppError(`Invalid ${fieldName}`, 400);
    }

    return parsed;
}

function parseIdentityString(value: unknown, fieldName: string, pattern: RegExp): string {
    const parsed = parseRequiredString(value, fieldName);
    if (!pattern.test(parsed)) {
        throw new AppError(`Invalid ${fieldName}`, 400);
    }

    return parsed;
}

function parseDateValue(value: unknown, fieldName: string): Date {
    const parsed = parseRequiredString(value, fieldName);
    const date = new Date(parsed);

    if (!Number.isFinite(date.getTime())) {
        throw new AppError(`Invalid ${fieldName}`, 400);
    }

    return date;
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

function ensureRetentionWindow(dateStart: Date, dateEnd: Date, nowMs: number): void {
    if (dateStart.getTime() >= dateEnd.getTime()) {
        throw new AppError('date_start must be before date_end', 400);
    }

    const retentionStartMs = nowMs - TELEMETRY_HISTORY_RETENTION_MS;
    if (dateStart.getTime() < retentionStartMs || dateEnd.getTime() > nowMs) {
        throw new AppError(
            `Telemetry history range must be within the ${TELEMETRY_HISTORY_RETENTION_DAYS}-day telemetry retention window`,
            400,
        );
    }
}

function toObjectId(value: string, fieldName: string): mongoose.Types.ObjectId {
    if (!mongoose.isValidObjectId(value)) {
        throw new AppError(`Invalid ${fieldName}`, 400);
    }

    return new mongoose.Types.ObjectId(value);
}

function toIsoString(value: Date | string | number): string {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) {
        throw new AppError('Invalid telemetry history aggregate timestamp', 500);
    }

    return date.toISOString();
}

function assertFiniteNumber(value: number, fieldName: string): number {
    if (!Number.isFinite(value)) {
        throw new AppError(`Invalid telemetry history aggregate ${fieldName}`, 500);
    }

    return value;
}

function projectTelemetryHistoryPoint(point: RawTelemetryHistoryPoint): TelemetryHistoryPointDto {
    return {
        timeStart: toIsoString(point.timeStart),
        timeEnd: toIsoString(point.timeEnd),
        pointTime: toIsoString(point.pointTime),
        min: assertFiniteNumber(point.min, 'min'),
        max: assertFiniteNumber(point.max, 'max'),
        avg: assertFiniteNumber(point.avg, 'avg'),
        last: assertFiniteNumber(point.last, 'last'),
        count: assertFiniteNumber(point.count, 'count'),
    };
}

export function parseTelemetryHistoryQuery(
    query: TelemetryHistoryQueryInput = {},
    nowMs: number = Date.now(),
): TelemetryHistoryQueryDto {
    const edgeId = parseObjectIdString(query.edgeId, TELEMETRY_HISTORY_QUERY_FIELDS.edgeId);
    const deviceId = parseIdentityString(
        query.deviceId,
        TELEMETRY_HISTORY_QUERY_FIELDS.deviceId,
        DEVICE_ID_PATTERN,
    );
    const metric = parseIdentityString(query.metric, TELEMETRY_HISTORY_QUERY_FIELDS.metric, METRIC_PATTERN);
    const dateStart = parseDateValue(query.date_start, TELEMETRY_HISTORY_QUERY_FIELDS.dateStart);
    const dateEnd = parseDateValue(query.date_end, TELEMETRY_HISTORY_QUERY_FIELDS.dateEnd);
    const maxPoints = parsePositiveInteger(
        query.maxPoints,
        TELEMETRY_HISTORY_QUERY_FIELDS.maxPoints,
        TELEMETRY_HISTORY_DEFAULT_MAX_POINTS,
    );

    if (maxPoints > TELEMETRY_HISTORY_MAX_POINTS) {
        throw new AppError(`Invalid maxPoints: maximum is ${TELEMETRY_HISTORY_MAX_POINTS}`, 400);
    }

    ensureRetentionWindow(dateStart, dateEnd, nowMs);

    return {
        edgeId,
        deviceId,
        metric,
        dateStart,
        dateEnd,
        maxPoints,
    };
}

export async function assertTrustedTelemetryHistoryAccess(
    input: TrustedTelemetryHistoryAccessInput,
): Promise<void> {
    const edgeId = toObjectId(input.edgeId, TELEMETRY_HISTORY_QUERY_FIELDS.edgeId);
    const userId = toObjectId(input.userId, 'userId');

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
}

export function buildNumericTelemetryHistoryPipeline(query: TelemetryHistoryQueryDto): PipelineStage[] {
    return [
        {
            $match: {
                'metadata.edgeId': query.edgeId,
                'metadata.deviceId': query.deviceId,
                metric: query.metric,
                'rollup.kind': TELEMETRY_HISTORY_NUMERIC_ROLLUP_KIND,
                timestamp: {
                    $gte: query.dateStart,
                    $lt: query.dateEnd,
                },
            },
        },
        { $sort: { timestamp: 1 } },
        {
            $bucketAuto: {
                groupBy: '$timestamp',
                buckets: query.maxPoints,
                output: {
                    timeStart: { $min: '$timestamp' },
                    timeEnd: { $max: '$timestamp' },
                    min: { $min: '$rollup.min' },
                    max: { $max: '$rollup.max' },
                    totalSum: { $sum: '$rollup.sum' },
                    count: { $sum: '$rollup.count' },
                    last: { $last: '$rollup.last' },
                },
            },
        },
        {
            $project: {
                _id: 0,
                timeStart: 1,
                timeEnd: 1,
                pointTime: {
                    $add: [
                        '$timeStart',
                        { $divide: [{ $subtract: ['$timeEnd', '$timeStart'] }, 2] },
                    ],
                },
                min: 1,
                max: 1,
                avg: {
                    $cond: [
                        { $gt: ['$count', 0] },
                        { $divide: ['$totalSum', '$count'] },
                        0,
                    ],
                },
                last: 1,
                count: 1,
            },
        },
        { $sort: { timeStart: 1 } },
    ];
}

export async function aggregateNumericTelemetryHistory(
    query: TelemetryHistoryQueryDto,
): Promise<TelemetryHistoryResponseDto> {
    const series = await Telemetry.aggregate<RawTelemetryHistoryPoint>(
        buildNumericTelemetryHistoryPipeline(query),
    ).exec();

    return {
        edgeId: query.edgeId,
        deviceId: query.deviceId,
        metric: query.metric,
        dateStart: query.dateStart.toISOString(),
        dateEnd: query.dateEnd.toISOString(),
        maxPoints: query.maxPoints,
        series: series.map(projectTelemetryHistoryPoint),
    };
}

export async function getTrustedTelemetryHistory(
    input: TrustedTelemetryHistoryInput,
): Promise<TelemetryHistoryResponseDto> {
    const query = parseTelemetryHistoryQuery(input.query);

    await assertTrustedTelemetryHistoryAccess({
        edgeId: query.edgeId,
        userId: input.userId,
    });

    return await aggregateNumericTelemetryHistory(query);
}
