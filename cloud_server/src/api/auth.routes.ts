import { Router } from 'express';
import { AuthController } from './auth.controller';

const authRouter = Router();

// Public auth endpoints — mounted at / in app.ts → /auth/*
authRouter.post('/auth/register', AuthController.register);
authRouter.post('/auth/login', AuthController.login);

export default authRouter;
