import { type Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { ENV } from '../config/env';
import { markEdgeOffline } from '../services/edge-servers.service';
import { TelemetryAggregatorService } from '../services/telemetry-aggregator.service';
import { jwtSocketMiddleware } from './auth';
import {
    disconnectEdgeSockets,
    type EdgeForcedDisconnectReason,
    getActiveEdgeSocketCount,
    registerEdgeNamespace,
    resetActiveEdgeSocketsForTests,
} from './events/edge';
import { registerSubscribeHandler } from './events/subscribe';

let _io: Server | null = null;
let _drainHandle: NodeJS.Timeout | null = null;

export function initSocketIO(httpServer: HttpServer): Server {
    if (_io) {
        console.warn('[socket.io] Already initialized - returning existing instance');
        return _io;
    }

    _io = new Server(httpServer, {
        cors: {
            origin: ENV.CORS_ORIGINS,
            methods: ['GET', 'POST'],
            credentials: true,
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 60000,
    });

    const dashboardNs = _io.of('/');
    dashboardNs.use(jwtSocketMiddleware);

    dashboardNs.on('connection', (socket: Socket) => {
        console.log(`[socket.io] Dashboard connected: ${socket.id} from ${socket.handshake.address}`);

        registerSubscribeHandler(socket);

        socket.on('disconnect', (reason: string) => {
            console.log(`[socket.io] Dashboard disconnected: ${socket.id} - reason: ${reason}`);
        });

        socket.on('error', (err: Error) => {
            console.error(`[socket.io] Socket error (${socket.id}):`, err.message);
        });
    });

    registerEdgeNamespace(_io);
    _drainHandle = TelemetryAggregatorService.startDrainLoop(_io);

    console.log('[socket.io] Initialized and attached to HTTP server');
    return _io;
}

export function getIO(): Server {
    if (!_io) {
        throw new Error('[socket.io] Not initialized. Call initSocketIO(httpServer) first.');
    }
    return _io;
}

export async function disconnectEdgeSocketsById(
    edgeId: string,
    reason?: EdgeForcedDisconnectReason,
): Promise<number> {
    const disconnectedSockets = disconnectEdgeSockets(edgeId, reason);
    if (disconnectedSockets > 0) {
        await markEdgeOffline(edgeId);
    }

    return disconnectedSockets;
}

export function getConnectedEdgeSocketCount(edgeId?: string): number {
    return getActiveEdgeSocketCount(edgeId);
}

export function _resetIO(): void {
    if (_drainHandle) {
        TelemetryAggregatorService.stopDrainLoop(_drainHandle);
        _drainHandle = null;
    }

    TelemetryAggregatorService.resetForTests();
    resetActiveEdgeSocketsForTests();
    _io = null;
}
