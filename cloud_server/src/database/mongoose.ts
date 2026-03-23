import mongoose from 'mongoose';
import { ENV } from '../config/env';

function extractDatabaseName(uri: string): string | undefined {
    const uriWithoutQuery = uri.split('?')[0] ?? uri;
    const trimmed = uriWithoutQuery.endsWith('/') ? uriWithoutQuery.slice(0, -1) : uriWithoutQuery;
    const lastSlash = trimmed.lastIndexOf('/');
    if (lastSlash < 0) return undefined;
    const dbName = trimmed.slice(lastSlash + 1);
    return dbName.length > 0 ? dbName : undefined;
}

function assertSafeTestMongoUri(uri: string): void {
    const isVitestRuntime = process.env['VITEST'] === 'true';
    const isTestEnvironment = ENV.NODE_ENV === 'test';
    if (!isVitestRuntime && !isTestEnvironment) return;

    const dbName = extractDatabaseName(uri);
    const isTestDatabase = typeof dbName === 'string' && /(?:^|[_-])test(?:s)?$/i.test(dbName);
    if (isTestDatabase) return;

    throw new Error(
        `[database] Unsafe MongoDB URI for tests: "${uri}". ` +
            'Use an isolated test database name ending with "_test" (for example "vkr_scada_test").',
    );
}

/** Returns true if Mongoose is currently connected to MongoDB. */
export function isConnected(): boolean {
    return mongoose.connection.readyState === 1;
}

/**
 * Establishes a Mongoose connection to MongoDB.
 * Idempotent - safe to call multiple times; reconnects only when needed.
 */
export async function connectDatabase(): Promise<void> {
    if (isConnected()) return;
    assertSafeTestMongoUri(ENV.MONGO_URI);

    mongoose.connection.on('connected', () => {
        console.log('[database] MongoDB connected');
    });

    mongoose.connection.on('error', (err: Error) => {
        console.error('[database] MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
        console.warn('[database] MongoDB disconnected - attempting reconnect...');
    });

    await mongoose.connect(ENV.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    });
}

/**
 * Gracefully closes the Mongoose connection.
 * Should be called on process SIGTERM/SIGINT.
 */
export async function disconnectDatabase(): Promise<void> {
    if (!isConnected()) return;
    await mongoose.disconnect();
    console.log('[database] MongoDB disconnected gracefully');
}

export { mongoose };
