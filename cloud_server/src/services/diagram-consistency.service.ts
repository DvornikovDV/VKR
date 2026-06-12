import { Diagram } from '../models/Diagram';
import { DiagramBindings } from '../models/DiagramBindings';
import { User } from '../models/User';
import { DiagramQuotaService } from './diagram-quota.service';

export interface DiagramConsistencyRepairResult {
    orphanBindingsRemoved: number;
    obsoleteUserLocksCleared: number;
    slotsCleared: number;
    freeOwnersReconciled: number;
}

async function repair(): Promise<DiagramConsistencyRepairResult> {
    const orphanBindings = await DiagramBindings.aggregate<{ _id: unknown }>([
        {
            $lookup: {
                from: Diagram.collection.name,
                localField: 'diagramId',
                foreignField: '_id',
                as: 'parentDiagram',
            },
        },
        { $match: { parentDiagram: { $size: 0 } } },
        { $project: { _id: 1 } },
    ]).exec();
    const orphanResult = await DiagramBindings.deleteMany({
        _id: { $in: orphanBindings.map((binding) => binding._id) },
    }).exec();

    const obsoleteLocks = await User.collection.updateMany(
        {
            $or: [
                { diagramQuotaMutationPending: { $exists: true } },
                { diagramQuotaActiveCreates: { $exists: true } },
            ],
        },
        {
            $unset: {
                diagramQuotaMutationPending: '',
                diagramQuotaActiveCreates: '',
            },
        },
    );

    const quotaResult = await DiagramQuotaService.reconcileAllQuotaSlots();
    return {
        orphanBindingsRemoved: orphanResult.deletedCount,
        obsoleteUserLocksCleared: obsoleteLocks.modifiedCount,
        ...quotaResult,
    };
}

export const DiagramConsistencyService = {
    repair,
};
