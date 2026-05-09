import { type Response, type NextFunction } from 'express';

import { AppError } from './middlewares/error.middleware';
import { type AuthRequest } from './middlewares/auth.middleware';
import {
    acknowledgeTrustedAlarmIncident,
    projectAlarmIncident,
} from '../services/alarm-incidents.service';
import { emitAlarmIncidentChanged } from '../socket/events/alarm';
import { getIO } from '../socket/io';
import type { AlarmIncidentAckResponseDto } from '../types';

async function ackIncident(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.user) {
            throw new AppError('Authentication required', 401);
        }

        const edgeId = req.params['edgeId'] ?? '';
        const incidentId = req.params['incidentId'] ?? '';
        const incident = await acknowledgeTrustedAlarmIncident({
            edgeId,
            incidentId,
            userId: req.user.userId,
        });
        const projection = projectAlarmIncident(incident);

        emitAlarmIncidentChanged(getIO(), edgeId, projection);

        const payload: AlarmIncidentAckResponseDto = {
            status: 'success',
            data: { incident: projection },
        };
        res.status(200).json(payload);
    } catch (err) {
        next(err);
    }
}

export const AlarmIncidentsController = {
    ackIncident,
};
