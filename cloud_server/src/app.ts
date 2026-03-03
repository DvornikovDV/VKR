import express from 'express';
import cors from 'cors';
import http from 'http';
import mongoose from 'mongoose';
import { ENV } from './config/env';
import { connectDatabase, disconnectDatabase } from './database/mongoose';
import { ensureTelemetryCollection } from './models/Telemetry';
import { initSocketIO } from './socket/io';
import { errorMiddleware, notFoundMiddleware } from './api/middlewares/error.middleware';
import apiRouter from './api/routes';
import authRouter from './api/auth.routes';
import { setupSwagger } from './api/swagger';

const app = express();
const server = http.createServer(app);

// ── Middleware ────────────────────────────────────────────────────────────
app.use(cors({ origin: ENV.CORS_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Socket.IO ─────────────────────────────────────────────────────────────
initSocketIO(server);

// ── Swagger ───────────────────────────────────────────────────────────────
setupSwagger(app);

// ── Routes ───────────────────────────────────────────────────────────────
// Auth: /auth/register, /auth/login (no /api prefix — matches openapi.yaml)
app.use('/', authRouter);
// API resources: /api/diagrams, /api/edge-servers, etc.
app.use('/api', apiRouter);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handling (must be last) ─────────────────────────────────────────
app.use(notFoundMiddleware);
app.use(errorMiddleware);

// ── Startup ───────────────────────────────────────────────────────────────
async function start(): Promise<void> {
    await connectDatabase();
    await ensureTelemetryCollection(mongoose.connection);

    server.listen(ENV.PORT, () => {
        console.log(`[cloud-server] Running on http://localhost:${ENV.PORT} (${ENV.NODE_ENV})`);
    });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
    console.log(`\n[cloud-server] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
        await disconnectDatabase();
        console.log('[cloud-server] Shutdown complete');
        process.exit(0);
    });
    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
        console.error('[cloud-server] Forced exit after timeout');
        process.exit(1);
    }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Only start the HTTP server when executed directly (not when imported in tests)
if (require.main === module) {
    start().catch((err: unknown) => {
        console.error('[cloud-server] Fatal startup error:', err);
        process.exit(1);
    });
}

export { app, server };
