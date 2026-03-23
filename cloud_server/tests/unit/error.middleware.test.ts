import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { AppError, errorMiddleware } from '../../src/api/middlewares/error.middleware';

type MockResponse = Response & {
    status: Mock;
    json: Mock;
};

function createResponse(): MockResponse {
    const res = {} as MockResponse;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
}

describe('error middleware', () => {
    let res: MockResponse;

    beforeEach(() => {
        res = createResponse();
    });

    it('returns AppError status and message', () => {
        const next = vi.fn() as unknown as NextFunction;
        const req = {} as Request;

        errorMiddleware(new AppError('Bad request', 400), req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            status: 'error',
            message: 'Bad request',
        });
    });

    it('maps body-parser oversized payload error to HTTP 413', () => {
        const next = vi.fn() as unknown as NextFunction;
        const req = {} as Request;

        const oversized = Object.assign(new Error('request entity too large'), {
            type: 'entity.too.large',
            status: 413,
        });

        errorMiddleware(oversized, req, res, next);

        expect(res.status).toHaveBeenCalledWith(413);
        expect(res.json).toHaveBeenCalledWith({
            status: 'error',
            message: 'Request body is too large',
        });
    });
});
