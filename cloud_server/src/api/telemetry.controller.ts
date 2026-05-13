import { type Response, type NextFunction } from 'express';

import { AppError } from './middlewares/error.middleware';
import { type AuthRequest } from './middlewares/auth.middleware';
import { getTrustedTelemetryHistory } from '../services/telemetry-history.service';

async function getHistoricTelemetry(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.user) {
            throw new AppError('Authentication required', 401);
        }

        const data = await getTrustedTelemetryHistory({
            userId: req.user.userId,
            query: req.query,
        });

        res.status(200).json({
            status: 'success',
            data,
        });
    } catch (err) {
        next(err);
    }
}

export const TelemetryController = {
    getHistoricTelemetry,
};
