import { io, type Socket } from 'socket.io-client';
import { loadConfig, maskSecret } from './config';

type TelemetryValue = number | boolean;

interface TelemetryReading {
    deviceId: string;
    metric: string;
    value: TelemetryValue;
    ts: number;
}

interface TelemetryBatchPayload {
    readings: TelemetryReading[];
}

interface EdgeDisconnectPayload {
    edgeId?: unknown;
    reason?: unknown;
}

const config = loadConfig();

let telemetryTimer: NodeJS.Timeout | null = null;
let tick = 0;

function asErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return String(error);
}

function stopTelemetryLoop(): void {
    if (!telemetryTimer) {
        return;
    }

    clearInterval(telemetryTimer);
    telemetryTimer = null;
    console.log('[edge-telemetry-test] Telemetry loop stopped');
}

function buildTelemetryBatch(nextTick: number, baseTs: number): TelemetryBatchPayload {
    const cycle = nextTick % 16;
    const readings: TelemetryReading[] = [
        {
            deviceId: 'pump-01',
            metric: 'temperature',
            value: Number((42 + cycle * 0.4).toFixed(2)),
            ts: baseTs,
        },
        {
            deviceId: 'pump-01',
            metric: 'running',
            value: cycle % 2 === 0,
            ts: baseTs,
        },
        {
            deviceId: 'tank-01',
            metric: 'level',
            value: Number((65 + ((cycle % 8) - 4) * 1.25).toFixed(2)),
            ts: baseTs,
        },
        {
            deviceId: 'line-01',
            metric: 'pressure',
            value: Number((4.2 + (cycle % 5) * 0.15).toFixed(2)),
            ts: baseTs,
        },
        {
            deviceId: 'alarm-01',
            metric: 'active',
            value: cycle === 0 || cycle === 8,
            ts: baseTs,
        },
    ];

    return { readings };
}

function emitTelemetry(socket: Socket): void {
    tick += 1;
    const payload = buildTelemetryBatch(tick, Date.now());
    socket.emit('telemetry', payload);

    console.log(
        `[edge-telemetry-test] Sent telemetry batch #${tick} (${payload.readings.length} readings)`,
    );
}

function startTelemetryLoop(socket: Socket): void {
    stopTelemetryLoop();
    emitTelemetry(socket);
    telemetryTimer = setInterval(() => {
        emitTelemetry(socket);
    }, config.telemetryIntervalMs);
    console.log(
        `[edge-telemetry-test] Telemetry loop started (${config.telemetryIntervalMs} ms interval)`,
    );
}

function shutdown(socket: Socket, exitCode = 0): void {
    stopTelemetryLoop();

    if (socket.connected) {
        socket.disconnect();
    }

    process.exit(exitCode);
}

function handleEdgeDisconnect(socket: Socket, payload: EdgeDisconnectPayload): void {
    const reason =
        typeof payload.reason === 'string' && payload.reason.trim().length > 0
            ? payload.reason
            : 'unknown';
    const edgeId =
        typeof payload.edgeId === 'string' && payload.edgeId.trim().length > 0
            ? payload.edgeId
            : config.edgeId;

    console.error(
        `[edge-telemetry-test] Cloud requested edge disconnect for ${edgeId}: ${reason}`,
    );
    stopTelemetryLoop();
    socket.disconnect();
}

function main(): void {
    console.log(`[edge-telemetry-test] Starting "${config.edgeName}"`);
    console.log(`[edge-telemetry-test] Cloud socket URL: ${config.cloudSocketUrl}`);
    console.log(`[edge-telemetry-test] Edge ID: ${config.edgeId}`);
    console.log(
        `[edge-telemetry-test] Persistent credential: ${maskSecret(config.edgePersistentSecret)}`,
    );

    const socket = io(config.cloudSocketUrl, {
        autoConnect: false,
        reconnection: false,
        timeout: 10000,
        auth: {
            edgeId: config.edgeId,
            credentialMode: 'persistent',
            credentialSecret: config.edgePersistentSecret,
        },
    });

    socket.on('connect', () => {
        console.log(`[edge-telemetry-test] Connected to cloud as socket ${socket.id}`);
        startTelemetryLoop(socket);
    });

    socket.on('connect_error', (error: unknown) => {
        stopTelemetryLoop();
        console.error(`[edge-telemetry-test] Connect error: ${asErrorMessage(error)}`);
        process.exitCode = 1;
    });

    socket.on('disconnect', (reason: string) => {
        stopTelemetryLoop();
        console.warn(`[edge-telemetry-test] Disconnected: ${reason}`);
    });

    socket.on('edge_disconnect', (payload: EdgeDisconnectPayload) => {
        handleEdgeDisconnect(socket, payload);
    });

    process.on('SIGINT', () => {
        console.log('[edge-telemetry-test] SIGINT received');
        shutdown(socket, 0);
    });

    process.on('SIGTERM', () => {
        console.log('[edge-telemetry-test] SIGTERM received');
        shutdown(socket, 0);
    });

    socket.connect();
}

main();
