import { AppError } from '../api/middlewares/error.middleware';
import { COMMAND_TYPES, type CommandType } from '../types';
import { normalizeDeviceId, normalizeMetric } from './edge-identity.validation';

const CATALOG_VALUE_TYPES = ['boolean', 'number', 'string'] as const;
type CatalogValueType = (typeof CATALOG_VALUE_TYPES)[number];

export interface EdgeCatalogTelemetryMetric {
    deviceId: string;
    metric: string;
    valueType?: CatalogValueType;
    label: string;
}

export interface EdgeCatalogCommandCapability {
    deviceId: string;
    commandType: CommandType;
    valueType: Extract<CatalogValueType, 'boolean' | 'number'>;
    min?: number;
    max?: number;
    reportedMetric: string;
    label: string;
}

export interface EdgeCapabilitiesCatalog {
    edgeServerId: string;
    telemetry: EdgeCatalogTelemetryMetric[];
    commands: EdgeCatalogCommandCapability[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readArray(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new AppError(`${label} must be an array`, 400);
    }

    return value;
}

function readOptionalCatalogValueType(value: unknown, label: string): CatalogValueType | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value === 'string' && CATALOG_VALUE_TYPES.includes(value as CatalogValueType)) {
        return value as CatalogValueType;
    }

    throw new AppError(`${label} must be 'boolean', 'number', or 'string'`, 400);
}

function readCommandType(value: unknown): CommandType | null {
    if (typeof value === 'string' && COMMAND_TYPES.includes(value as CommandType)) {
        return value as CommandType;
    }

    return null;
}

function readFiniteNumber(value: unknown, label: string): number | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AppError(`${label} must be a finite number`, 400);
    }

    return value;
}

function sanitizeLabel(value: unknown, fallback: string): string {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized.slice(0, 160) : fallback;
}

function normalizeTelemetryMetric(input: unknown): EdgeCatalogTelemetryMetric {
    if (!isRecord(input)) {
        throw new AppError('telemetry entries must be objects', 400);
    }

    const deviceId = normalizeDeviceId(input['deviceId']);
    if (!deviceId) {
        throw new AppError('telemetry.deviceId must match [A-Za-z0-9._-]+', 400);
    }

    const metric = normalizeMetric(input['metric']);
    if (!metric) {
        throw new AppError('telemetry.metric must match [A-Za-z0-9._:/%-]+', 400);
    }

    const valueType = readOptionalCatalogValueType(input['valueType'], 'telemetry.valueType');
    const telemetry: EdgeCatalogTelemetryMetric = {
        deviceId,
        metric,
        label: sanitizeLabel(input['label'], `${deviceId} / ${metric}`),
    };

    if (valueType) {
        telemetry.valueType = valueType;
    }

    return telemetry;
}

function normalizeCommandCapability(input: unknown): EdgeCatalogCommandCapability {
    if (!isRecord(input)) {
        throw new AppError('commands entries must be objects', 400);
    }

    const deviceId = normalizeDeviceId(input['deviceId']);
    if (!deviceId) {
        throw new AppError('commands.deviceId must match [A-Za-z0-9._-]+', 400);
    }

    const commandType = readCommandType(input['commandType']);
    if (!commandType) {
        throw new AppError("commands.commandType must be 'set_bool' or 'set_number'", 400);
    }

    const expectedValueType = commandType === 'set_bool' ? 'boolean' : 'number';
    if (input['valueType'] !== expectedValueType) {
        throw new AppError(`commands.valueType must be '${expectedValueType}' for ${commandType}`, 400);
    }

    const reportedMetric = normalizeMetric(input['reportedMetric']);
    if (!reportedMetric) {
        throw new AppError('commands.reportedMetric must match [A-Za-z0-9._:/%-]+', 400);
    }

    const command: EdgeCatalogCommandCapability = {
        deviceId,
        commandType,
        valueType: expectedValueType,
        reportedMetric,
        label: sanitizeLabel(input['label'], `${deviceId} / ${commandType}`),
    };

    if (commandType === 'set_number') {
        const min = readFiniteNumber(input['min'], 'commands.min');
        const max = readFiniteNumber(input['max'], 'commands.max');
        if (min !== undefined) {
            command.min = min;
        }
        if (max !== undefined) {
            command.max = max;
        }
    }

    return command;
}

export function validateEdgeCapabilitiesCatalog(
    authenticatedEdgeId: string,
    payload: unknown,
): EdgeCapabilitiesCatalog {
    if (!isRecord(payload)) {
        throw new AppError('Capabilities catalog payload must be an object', 400);
    }

    if (payload['edgeServerId'] !== authenticatedEdgeId) {
        throw new AppError('Capabilities catalog edgeServerId mismatch', 403);
    }

    return {
        edgeServerId: authenticatedEdgeId,
        telemetry: readArray(payload['telemetry'], 'telemetry').map(normalizeTelemetryMetric),
        commands: readArray(payload['commands'], 'commands').map(normalizeCommandCapability),
    };
}
