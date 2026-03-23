import { type Socket, type Server as IOServer } from 'socket.io';
import { TelemetryAggregatorService, type TelemetryReading } from '../../services/telemetry-aggregator.service';
import { updateLastSeen } from '../../services/edge-servers.service';

export interface TelemetryBatchPayload {
    readings?: TelemetryReading[];
}

export interface TelemetryBroadcast {
    edgeId: string;
    readings: Array<{
        sourceId: string;
        deviceId: string;
        metric: string;
        last: number | boolean;
        ts: number;
    }>;
    serverTs: number;
}

export function registerTelemetryHandler(
    socket: Socket,
    io: IOServer,
    edgeId: string,
): void {
    let onlineNotified = false;

    socket.on('telemetry', (payload: TelemetryBatchPayload) => {
        if (!payload || !Array.isArray(payload.readings) || payload.readings.length === 0) {
            console.warn(`[telemetry] Empty or invalid payload from edge ${edgeId}`);
            return;
        }

        const serverTs = Date.now();

        const readings = payload.readings.filter((reading) =>
            typeof reading.sourceId === 'string' && reading.sourceId.length > 0 &&
            typeof reading.deviceId === 'string' && reading.deviceId.length > 0 &&
            typeof reading.metric === 'string' && reading.metric.length > 0 &&
            (typeof reading.value === 'number' || typeof reading.value === 'boolean') &&
            typeof reading.ts === 'number' &&
            Number.isFinite(reading.ts) &&
            TelemetryAggregatorService.isTimestampValid(reading.ts, serverTs),
        );

        if (readings.length === 0) {
            console.warn(`[telemetry] All readings from edge ${edgeId} failed validation`);
            return;
        }

        updateLastSeen(edgeId);

        if (!onlineNotified) {
            onlineNotified = true;
            io.to(edgeId).emit('edge_status', { edgeId, online: true });
        }

        const broadcastPayload: TelemetryBroadcast = {
            edgeId,
            readings: readings.map((reading) => ({
                sourceId: reading.sourceId,
                deviceId: reading.deviceId,
                metric: reading.metric,
                last: reading.value,
                ts: reading.ts,
            })),
            serverTs,
        };

        // Broadcast-first path: realtime updates do not wait for DB writes.
        io.to(edgeId).emit('telemetry', broadcastPayload);

        // Feed validated event-time readings into history rollup pipeline.
        TelemetryAggregatorService.ingest(edgeId, readings, serverTs);
    });
}
