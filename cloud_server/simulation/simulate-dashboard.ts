import { io } from 'socket.io-client';

/**
 * SIMULATION: Dashboard Client
 * This script emulates a frontend operator panel receiving real-time data.
 */

// --- CONFIGURATION ---
const CLOUD_URL = 'http://localhost:4000';
const JWT_TOKEN: string = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWE2YTcwZGExYmEwZDUxMmZlYzU3ZTIiLCJlbWFpbCI6InVzZXJAdGVzdC5jb20iLCJyb2xlIjoiVVNFUiIsInN1YnNjcmlwdGlvblRpZXIiOiJGUkVFIiwiaWF0IjoxNzcyNTI5NDg3LCJleHAiOjE3NzMxMzQyODd9.cG7afuehDqr5hr7IvcBuZFf6uJAZ31bOThyHeuihTsE'; // Replace with token from login
const EDGE_ID: string = '69a6a70da1ba0d512fec57e4'; // Replace with ID from seed script
// --------------------

if (EDGE_ID === 'PLACEHOLDER_ID' || JWT_TOKEN.includes('PLACEHOLDER')) {
    console.error('❌ ERROR: Please replace PLACEHOLDERs with actual values');
    console.log('1. Run seed.ts to get EDGE_ID');
    console.log('2. Perform login via Swagger/Postman to get JWT');
    process.exit(1);
}

const socket = io(`${CLOUD_URL}/`, {
    auth: {
        token: JWT_TOKEN
    }
});


socket.on('connect', () => {
    console.log(`✅ [Dashboard] Connected to Cloud. Socket ID: ${socket.id}`);

    // Subscribe to specific machine
    console.log(`📡 [Dashboard] Subscribing to machine: ${EDGE_ID}...`);
    socket.emit('subscribe', { edgeId: EDGE_ID });
});

socket.on('subscribed', (data: { edgeId: string }) => {
    console.log(`✨ [Dashboard] Successfully subscribed to: ${data.edgeId}`);
});

// Status pushed by cloud when edge connects / disconnects
socket.on('edge_status', (data: { edgeId: string; online: boolean }) => {
    const status = data.online ? '🟢 ONLINE' : '🔴 OFFLINE';
    console.log(`\n[Dashboard] Edge (${data.edgeId}) status: ${status}`);
});

socket.on('error', (err: { message: string }) => {
    console.error('❌ [Dashboard] Error received:', err.message);
});

socket.on('telemetry', (data: any) => {
    console.log('\n--- Real-time Update ---');
    console.log(`Time: ${new Date(data.serverTs).toLocaleTimeString()}`);
    data.readings.forEach((tag: any) => {
        console.log(`🏷️  ${tag.metric} (from ${tag.sourceId || 'default'}): ${tag.last}`);
    });
});

socket.on('connect_error', (err: Error) => {
    console.error('❌ [Dashboard] Connection error:', err.message);
});

socket.on('disconnect', (reason: string) => {
    console.log('⚠️ [Dashboard] Disconnected:', reason);
});
