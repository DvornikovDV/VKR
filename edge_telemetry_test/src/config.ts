export interface EdgeTelemetryTestConfig {
    cloudSocketUrl: string;
    edgeId: string;
    edgePersistentSecret: string;
    telemetryIntervalMs: number;
    edgeName: string;
    serialPortPath: string | null;
    serialBaudRate: number;
    serialDeviceId: string;
    serialIncludeHumidity: boolean;
}

const DEFAULT_TELEMETRY_INTERVAL_MS = 500;
const DEFAULT_EDGE_NAME = 'Local Telemetry Test Edge';
const DEFAULT_SERIAL_BAUD_RATE = 115200;
const DEFAULT_SERIAL_DEVICE_ID = 'arduino-uno-01';

function requireNonEmptyEnv(key: string): string {
    const raw = process.env[key];
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return raw.trim();
}

function optionalPositiveIntEnv(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined) {
        return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Environment variable ${key} must be a positive integer, got "${raw}"`);
    }

    return parsed;
}

function optionalTrimmedEnv(key: string, fallback: string): string {
    const raw = process.env[key];
    if (raw === undefined) {
        return fallback;
    }

    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        throw new Error(`Environment variable ${key} must be a non-empty string when provided.`);
    }

    return trimmed;
}

function optionalNullableTrimmedEnv(key: string): string | null {
    const raw = process.env[key];
    if (raw === undefined) {
        return null;
    }

    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function optionalBooleanEnv(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    if (raw === undefined) {
        return fallback;
    }

    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    throw new Error(
        `Environment variable ${key} must be boolean-like (true/false/1/0/yes/no), got "${raw}"`,
    );
}

function normalizeCloudSocketUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim().replace(/\/+$/, '');
    if (trimmed.endsWith('/edge')) {
        return trimmed;
    }

    return `${trimmed}/edge`;
}

export function maskSecret(secret: string): string {
    if (secret.length <= 8) {
        return '***';
    }

    return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

export function loadConfig(): EdgeTelemetryTestConfig {
    return {
        cloudSocketUrl: normalizeCloudSocketUrl(requireNonEmptyEnv('CLOUD_SOCKET_URL')),
        edgeId: requireNonEmptyEnv('EDGE_ID'),
        edgePersistentSecret: requireNonEmptyEnv('EDGE_PERSISTENT_SECRET'),
        telemetryIntervalMs: optionalPositiveIntEnv(
            'TELEMETRY_INTERVAL_MS',
            DEFAULT_TELEMETRY_INTERVAL_MS,
        ),
        edgeName: optionalTrimmedEnv('EDGE_NAME', DEFAULT_EDGE_NAME),
        serialPortPath: optionalNullableTrimmedEnv('SERIAL_PORT_PATH'),
        serialBaudRate: optionalPositiveIntEnv('SERIAL_BAUD_RATE', DEFAULT_SERIAL_BAUD_RATE),
        serialDeviceId: optionalTrimmedEnv('SERIAL_DEVICE_ID', DEFAULT_SERIAL_DEVICE_ID),
        serialIncludeHumidity: optionalBooleanEnv('SERIAL_INCLUDE_HUMIDITY', true),
    };
}
