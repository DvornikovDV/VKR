import { connectDatabase, disconnectDatabase } from '../database/mongoose';
import { DiagramQuotaService } from '../services/diagram-quota.service';

async function migrateDiagramQuotaSlots(): Promise<void> {
    await connectDatabase();

    try {
        const result = await DiagramQuotaService.reconcileAllQuotaSlots();
        console.log(
            `[migrate-diagram-quota-slots] slotsCleared=${result.slotsCleared} ` +
            `freeOwnersReconciled=${result.freeOwnersReconciled}`,
        );
    } finally {
        await disconnectDatabase();
    }
}

if (require.main === module) {
    migrateDiagramQuotaSlots().catch((error: unknown) => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(`[migrate-diagram-quota-slots] Failed: ${message}`);
        process.exit(1);
    });
}

export { migrateDiagramQuotaSlots };
