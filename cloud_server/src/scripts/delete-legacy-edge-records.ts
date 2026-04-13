import { connectDatabase, disconnectDatabase } from '../database/mongoose';
import { EDGE_LIFECYCLE_STATES, EdgeServer } from '../models/EdgeServer';

async function deleteLegacyEdgeRecords(): Promise<void> {
    await connectDatabase();

    try {
        const result = await EdgeServer.deleteMany({
            $or: [
                { lifecycleState: { $nin: [...EDGE_LIFECYCLE_STATES] } },
                { activation: { $exists: true } },
                { currentOnboardingPackage: { $exists: true } },
            ],
        }).exec();

        console.log(`[delete-legacy-edge-records] deleted=${result.deletedCount ?? 0}`);
    } finally {
        await disconnectDatabase();
    }
}

if (require.main === module) {
    deleteLegacyEdgeRecords().catch((error: unknown) => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(`[delete-legacy-edge-records] Failed: ${message}`);
        process.exit(1);
    });
}

export { deleteLegacyEdgeRecords };
