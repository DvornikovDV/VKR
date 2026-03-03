import { Server, type Socket } from 'socket.io';
import { type Server as HttpServer } from 'http';
import { ENV } from '../config/env';
import { jwtSocketMiddleware } from './auth';
import { registerSubscribeHandler } from './events/subscribe';
import { registerEdgeNamespace } from './events/edge';
import { TelemetryAggregatorService } from '../services/telemetry-aggregator.service';

// ── Singleton instance ────────────────────────────────────────────────────

let _io: Server | null = null;

// ── Drain loop handle ─────────────────────────────────────────────────────

let _drainHandle: NodeJS.Timeout | null = null;

// ── Init ──────────────────────────────────────────────────────────────────

/**
 * Creates and attaches a Socket.IO server to the given HTTP server.
 * Must be called once during application startup.
 *
 * Namespaces:
 *   - "/" (default) — dashboard UI clients; authenticated via JWT middleware
 *   - "/edge"       — edge device connections; authenticated via API key (bcrypt)
 *
 * @param httpServer - The Node.js HTTP server instance.
 * @returns The initialized Socket.IO Server instance.
 */
export function initSocketIO(httpServer: HttpServer): Server {
    if (_io) {
        console.warn('[socket.io] Already initialized — returning existing instance');
        return _io;
    }

    _io = new Server(httpServer, {
        cors: {
            origin: ENV.CORS_ORIGINS,
            methods: ['GET', 'POST'],
            credentials: true,
        },
        transports: ['websocket', 'polling'],
        // Ping clients every 25s; disconnect if no pong within 60s
        pingInterval: 25000,
        pingTimeout: 60000,
    });

    // ── Dashboard namespace (default "/") ─────────────────────────────────
    // All dashboard clients must present a valid JWT in handshake.auth.token
    _io.use(jwtSocketMiddleware);

    _io.on('connection', (socket: Socket) => {
        console.log(`[socket.io] Dashboard connected: ${socket.id} from ${socket.handshake.address}`);

        // Register `subscribe` event for joining edge telemetry rooms
        registerSubscribeHandler(socket);

        socket.on('disconnect', (reason: string) => {
            console.log(`[socket.io] Dashboard disconnected: ${socket.id} — reason: ${reason}`);
        });

        socket.on('error', (err: Error) => {
            console.error(`[socket.io] Socket error (${socket.id}):`, err.message);
        });
    });

    // ── Edge namespace ("/edge") ───────────────────────────────────────────
    registerEdgeNamespace(_io);

    // ── Start telemetry aggregation drain loop ────────────────────────────
    _drainHandle = TelemetryAggregatorService.startDrainLoop(_io);

    console.log('[socket.io] Initialized and attached to HTTP server');
    return _io;
}

/**
 * Returns the Socket.IO singleton.
 * Throws if called before initSocketIO().
 */
export function getIO(): Server {
    if (!_io) {
        throw new Error('[socket.io] Not initialized. Call initSocketIO(httpServer) first.');
    }
    return _io;
}

/** Resets the internal IO instance (for testing purposes only). */
export function _resetIO(): void {
    if (_drainHandle) {
        TelemetryAggregatorService.stopDrainLoop(_drainHandle);
        _drainHandle = null;
    }
    _io = null;
}
