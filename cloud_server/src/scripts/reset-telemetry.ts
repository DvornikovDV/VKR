import { connectDatabase, disconnectDatabase, mongoose } from '../database/mongoose';
import { ensureTelemetryCollection } from '../models/Telemetry';

type ResetLogger = Pick<Console, 'log' | 'warn'>;

function isConfirmed(argv: string[]): boolean {
    return argv.includes('--yes') || process.env['RESET_TELEMETRY_CONFIRM'] === 'true';
}

export async function resetTelemetryHistory(
    argv: string[] = process.argv.slice(2),
    logger: ResetLogger = console,
): Promise<void> {
    if (!isConfirmed(argv)) {
        throw new Error(
            'Refusing to reset telemetry without confirmation. ' +
            'Run: npm run reset:telemetry -- --yes',
        );
    }

    await connectDatabase();
    try {
        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection is not established.');
        }

        const existing = await db.listCollections({ name: 'telemetry' }).toArray();
        if (existing.length > 0) {
            await db.collection('telemetry').drop();
            logger.log('[reset-telemetry] Dropped existing telemetry collection.');
        } else {
            logger.warn('[reset-telemetry] Telemetry collection does not exist. Recreating.');
        }

        await ensureTelemetryCollection(mongoose.connection);
        logger.log('[reset-telemetry] Telemetry collection is ready.');
    } finally {
        await disconnectDatabase();
    }
}

if (require.main === module) {
    resetTelemetryHistory().catch((error: unknown) => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(`[reset-telemetry] Failed: ${message}`);
        process.exit(1);
    });
}
