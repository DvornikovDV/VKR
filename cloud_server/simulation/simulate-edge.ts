import { io } from 'socket.io-client';

/**
 * SIMULATION: Edge Server
 * This script emulates a physical machine pushing telemetry data.
 */

// --- CONFIGURATION ---
const CLOUD_URL = 'http://localhost:4000';
const EDGE_ID: string = '69a6a70da1ba0d512fec57e4'; // Replace with ID from seed script
const API_KEY = 'edge-secret-key';
// --------------------

if (EDGE_ID === 'PLACEHOLDER_ID') {
    console.error('❌ ERROR: Please replace PLACEHOLDER_ID with actual ID from seed.ts output');
    process.exit(1);
}

const socket = io(`${CLOUD_URL}/edge`, {
    extraHeaders: {
        'x-api-key': API_KEY,
        'x-edge-id': EDGE_ID
    }
});

socket.on('connect', () => {
    console.log(`✅ [Edge] Connected to Cloud. Socket ID: ${socket.id}`);

    // Simulate telemetry every 500ms
    setInterval(() => {
        const payload = {
            readings: [
                {
                    sourceId: 'PLC_01',
                    deviceId: 'MODULE_01',
                    metric: 'vibration',
                    value: parseFloat((10 + Math.random() * 5).toFixed(2)),
                    ts: Date.now()
                },
                {
                    sourceId: 'PLC_01',
                    deviceId: 'SENSOR_02',
                    metric: 'temperature',
                    value: parseFloat((45 + Math.random() * 2).toFixed(2)),
                    ts: Date.now()
                }
            ]
        };

        socket.emit('telemetry', payload);
        console.log(`📤 [Edge] Pushed ${payload.readings.length} metrics at ${new Date().toLocaleTimeString()}`);
    }, 500);
});

socket.on('connect_error', (err: Error) => {
    console.error('❌ [Edge] Connection error:', err.message);
});

socket.on('disconnect', (reason: string) => {
    console.log('⚠️ [Edge] Disconnected:', reason);
});
