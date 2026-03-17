import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import authRouter from '../../src/api/auth.routes';

describe('Auth rate-limit middleware', () => {
    it('returns 429 after repeated auth attempts', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api', authRouter);

        let status = 0;
        for (let i = 0; i < 7; i += 1) {
            const res = await request(app).post('/api/auth/login').send({});
            status = res.status;
        }

        expect(status).toBe(429);
    });
});
