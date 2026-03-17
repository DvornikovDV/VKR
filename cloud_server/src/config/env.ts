import 'dotenv/config';

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

/** Returns an optional trimmed string env var, or undefined when empty. */
function optional_trimmed_string(key: string): string | undefined {
    const raw = process.env[key];
    if (raw === undefined) return undefined;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
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

    /** Max PRO-tier diagram bindings (0 = unlimited) */
    MAX_PRO_BINDINGS: optional_int('MAX_PRO_BINDINGS', 0),

    /** Default ADMIN provisioning email (used by seed script) */
    DEFAULT_ADMIN_EMAIL: optional_trimmed_string('DEFAULT_ADMIN_EMAIL'),

    /** Default ADMIN provisioning password (used by seed script) */
    DEFAULT_ADMIN_PASSWORD: optional_trimmed_string('DEFAULT_ADMIN_PASSWORD'),
} as const;
