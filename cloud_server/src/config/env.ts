import dotenv from 'dotenv';
import path from 'node:path';

// Always load env from the cloud_server root, regardless of process.cwd().
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Validates that a required env variable is set and returns its value. */
function require_env(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

/** Parses an optional integer env var with a fallback default. */
function optional_int(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined) return fallback;
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) {
        throw new Error(`Environment variable ${key} must be an integer, got: "${raw}"`);
    }
    return parsed;
}

/** Parses an optional positive integer env var with a fallback default. */
function optional_positive_int(key: string, fallback: number): number {
    const parsed = optional_int(key, fallback);
    if (parsed <= 0) {
        throw new Error(`Environment variable ${key} must be > 0, got: "${parsed}"`);
    }
    return parsed;
}

/** Returns an optional trimmed string env var, or undefined when empty. */
function optional_trimmed_string(key: string): string | undefined {
    const raw = process.env[key];
    if (raw === undefined) return undefined;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

/** Parses an optional non-empty string env var with fallback. */
function optional_non_empty_string(key: string, fallback: string): string {
    const raw = process.env[key];
    if (raw === undefined) return fallback;
    const trimmed = raw.trim();
    if (!trimmed) {
        throw new Error(`Environment variable ${key} must be a non-empty string.`);
    }
    return trimmed;
}

export const ENV = {
    /** Node environment */
    NODE_ENV: process.env['NODE_ENV'] ?? 'development',

    /** Express HTTP port */
    PORT: optional_int('PORT', 4000),

    /** MongoDB connection URI */
    MONGO_URI: require_env('MONGO_URI'),

    /** Secret for signing JWTs */
    JWT_SECRET: require_env('JWT_SECRET'),

    /** JWT expiration (e.g. "7d", "24h") */
    JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'] ?? '7d',

    /** CORS allowed origins (comma-separated) */
    CORS_ORIGINS: (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(',').map(o => o.trim()),

    /** Max accepted HTTP request body size for JSON and URL-encoded payloads */
    REQUEST_BODY_LIMIT: optional_non_empty_string('REQUEST_BODY_LIMIT', '10mb'),

    /** Max PRO-tier diagram bindings (0 = unlimited) */
    MAX_PRO_BINDINGS: optional_int('MAX_PRO_BINDINGS', 0),

    /** Default ADMIN provisioning email (used by seed script) */
    DEFAULT_ADMIN_EMAIL: optional_trimmed_string('DEFAULT_ADMIN_EMAIL'),

    /** Default ADMIN provisioning password (used by seed script) */
    DEFAULT_ADMIN_PASSWORD: optional_trimmed_string('DEFAULT_ADMIN_PASSWORD'),

    /** One-time onboarding package validity (hours) */
    EDGE_ONBOARDING_PACKAGE_TTL_HOURS: optional_positive_int('EDGE_ONBOARDING_PACKAGE_TTL_HOURS', 24),

    /** Number of random bytes for one-time onboarding secret generation */
    EDGE_ONBOARDING_SECRET_BYTES: optional_positive_int('EDGE_ONBOARDING_SECRET_BYTES', 32),

    /** Number of random bytes for persistent reconnect secret generation */
    EDGE_PERSISTENT_SECRET_BYTES: optional_positive_int('EDGE_PERSISTENT_SECRET_BYTES', 48),

    /** Max reconnect attempts for runtime compatibility projections */
    EDGE_RECONNECT_MAX_ATTEMPTS: optional_positive_int('EDGE_RECONNECT_MAX_ATTEMPTS', 10),

    /** Base reconnect delay (ms) for runtime compatibility projections */
    EDGE_RECONNECT_BASE_DELAY_MS: optional_positive_int('EDGE_RECONNECT_BASE_DELAY_MS', 1_000),

    /** Max reconnect delay (ms) for runtime compatibility projections */
    EDGE_RECONNECT_MAX_DELAY_MS: optional_positive_int('EDGE_RECONNECT_MAX_DELAY_MS', 30_000),
} as const;
