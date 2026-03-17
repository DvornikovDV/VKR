import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthController } from './auth.controller';

const authRouter = Router();
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 'error',
        message: 'Too many authentication attempts. Please try again later.',
    },
});

// Public auth endpoints - mounted at /api in app.ts
authRouter.post('/auth/register', authLimiter, AuthController.register);
authRouter.post('/auth/login', authLimiter, AuthController.login);

export default authRouter;
