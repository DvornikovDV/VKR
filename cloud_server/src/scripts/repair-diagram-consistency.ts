import { connectDatabase, disconnectDatabase } from '../database/mongoose';
import { DiagramConsistencyService } from '../services/diagram-consistency.service';

async function repairDiagramConsistency(): Promise<void> {
    await connectDatabase();

    try {
        const result = await DiagramConsistencyService.repair();
        console.log(
            `[repair-diagram-consistency] orphanBindingsRemoved=${result.orphanBindingsRemoved} ` +
            `obsoleteUserLocksCleared=${result.obsoleteUserLocksCleared} ` +
            `slotsCleared=${result.slotsCleared} ` +
            `freeOwnersReconciled=${result.freeOwnersReconciled}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

if (require.main === module) {
    repairDiagramConsistency().catch((error: unknown) => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(`[repair-diagram-consistency] Failed: ${message}`);
        process.exit(1);
    });
}

export { repairDiagramConsistency };
