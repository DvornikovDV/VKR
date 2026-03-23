import { Request, Response, NextFunction } from 'express';

/**
 * Operational error with HTTP status code.
 * Distinguishes expected business errors from programmer errors.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    /** Operational = expected user-facing error; non-operational = bug. */
    public readonly isOperational: boolean;

    constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}

/** Catches unmatched routes and forwards a 404 AppError. */
export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction): void {
    next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

/**
 * Centralized Express error handler.
 * Must be registered last in the middleware chain (after all routes).
 */
export function errorMiddleware(
    err: Error | AppError,
    _req: Request,
    res: Response,
    _next: NextFunction,
): void {
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            status: 'error',
            message: err.message,
        });
        return;
    }

    const bodyParserError = err as Error & { type?: string; status?: number };
    if (bodyParserError.type === 'entity.too.large' || bodyParserError.status === 413) {
        res.status(413).json({
            status: 'error',
            message: 'Request body is too large',
        });
        return;
    }

    // Programmer error: log the full stack.
    console.error('[error] Unhandled exception:', err);

    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
    });
}
