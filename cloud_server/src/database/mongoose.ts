import mongoose from 'mongoose';
import { ENV } from '../config/env';

// ── Connection state ──────────────────────────────────────────────────────

/** Returns true if Mongoose is currently connected to MongoDB. */
export function isConnected(): boolean {
    return mongoose.connection.readyState === 1;
}

// ── Connection lifecycle ──────────────────────────────────────────────────

/**
 * Establishes a Mongoose connection to MongoDB.
 * Idempotent — safe to call multiple times; reconnects only when needed.
 */
export async function connectDatabase(): Promise<void> {
    if (isConnected()) return;

    mongoose.connection.on('connected', () => {
        console.log('[database] MongoDB connected');
    });

    mongoose.connection.on('error', (err: Error) => {
        console.error('[database] MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
        console.warn('[database] MongoDB disconnected — attempting reconnect...');
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
