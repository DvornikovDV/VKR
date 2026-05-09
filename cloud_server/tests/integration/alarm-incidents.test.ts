import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { AlarmIncident } from '../../src/models/AlarmIncident';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { resetActiveEdgeSocketsForTests } from '../../src/socket/events/edge';
import { ALARM_INCIDENT_CHANGED_EVENT_NAME, type AlarmEventPayloadDto } from '../../src/types';
import {
    bindEdgeToUser,
    cleanupClientSockets,
    connectDashboardSocket,
    connectEdgeSocket,
    createAdminSession,
    createUserSession,
    emitAlarmEvent,
    ensureServerListening,
    expectNoEvent,
    registerEdge,
    stopServerIfStarted,
    waitForAlarmIncidentChanged,
} from './edge-socket.helpers';
import { type Socket as ClientSocket } from 'socket.io-client';

describe('Alarm incidents trusted Edge socket path', () => {
    let socketBaseUrl = '';
    let startedSocketServer = false;
    const activeSockets = new Set<ClientSocket>();

    let adminToken = '';
    let userId = '';
    let userToken = '';

    beforeAll(async () => {
        await connectDatabase();
        await User.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        await AlarmIncident.deleteMany({}).exec();

        const listening = await ensureServerListening();
        socketBaseUrl = listening.socketBaseUrl;
        startedSocketServer = listening.startedSocketServer;

        ({ adminToken } = await createAdminSession('alarm_incidents_admin@test.com'));
        ({ userId, userToken } = await createUserSession('alarm_incidents_user@test.com'));
    });

    beforeEach(async () => {
        await cleanupClientSockets(activeSockets);
        resetActiveEdgeSocketsForTests();
        await AlarmIncident.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
    });

    afterEach(async () => {
        await cleanupClientSockets(activeSockets);
        resetActiveEdgeSocketsForTests();
    });

    afterAll(async () => {
        await cleanupClientSockets(activeSockets);
        resetActiveEdgeSocketsForTests();
        await AlarmIncident.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        await User.deleteMany({}).exec();
        await stopServerIfStarted(startedSocketServer);
        await disconnectDatabase();
    });

    function buildAlarmEvent(
        edgeId: string,
        overrides: Partial<AlarmEventPayloadDto> = {},
    ): AlarmEventPayloadDto {
        const rule = {
            ruleId: 'pump-temperature-high',
            ruleRevision: 'rev-1',
            conditionType: 'high' as const,
            triggerThreshold: 90,
            clearThreshold: 85,
            expectedValue: null,
            severity: 'danger' as const,
            label: 'Pump temperature high',
            ...overrides.rule,
        };

        return {
            edgeId,
            eventType: 'active',
            sourceId: 'plc-line-1',
            deviceId: 'pump-1',
            metric: 'temperature',
            value: 92.5,
            ts: 1_777_777_001,
            detectedAt: 1_777_777_002,
            ...overrides,
            rule,
        };
    }

    it(
        'persists active, suppresses duplicate active, clears the reusable incident, and broadcasts changes',
        async () => {
            const registered = await registerEdge(adminToken, 'Alarm Incident Edge');
            await bindEdgeToUser(adminToken, registered.edgeId, userId);

            const dashboardSocket = await connectDashboardSocket(
                socketBaseUrl,
                activeSockets,
                userToken,
                registered.edgeId,
            );
            const edgeSocket = await connectEdgeSocket(socketBaseUrl, activeSockets, {
                edgeId: registered.edgeId,
                credentialSecret: registered.credentialSecret,
            });

            emitAlarmEvent(edgeSocket, buildAlarmEvent(new Types.ObjectId().toHexString()));
            await expect(expectNoEvent(dashboardSocket, ALARM_INCIDENT_CHANGED_EVENT_NAME)).resolves.toBeUndefined();
            await expect(AlarmIncident.countDocuments({ edgeId: registered.edgeId }).exec()).resolves.toBe(0);

            const activeBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
            emitAlarmEvent(edgeSocket, buildAlarmEvent(registered.edgeId));
            const activeChanged = await activeBroadcast;

            expect(activeChanged.edgeId).toBe(registered.edgeId);
            expect(activeChanged.incident).toMatchObject({
                edgeId: registered.edgeId,
                sourceId: 'plc-line-1',
                deviceId: 'pump-1',
                metric: 'temperature',
                ruleId: 'pump-temperature-high',
                isActive: true,
                isAcknowledged: false,
                lifecycleState: 'active_unacknowledged',
            });

            const incidentId = activeChanged.incident.incidentId;
            const acknowledgedAt = new Date('2026-05-09T06:00:00.000Z');
            await AlarmIncident.findByIdAndUpdate(incidentId, {
                $set: {
                    isAcknowledged: true,
                    acknowledgedAt,
                    acknowledgedBy: userId,
                },
            }).exec();

            const duplicateBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
            emitAlarmEvent(edgeSocket, buildAlarmEvent(registered.edgeId, {
                value: 94,
                ts: 1_777_777_011,
                detectedAt: 1_777_777_012,
                rule: { ruleRevision: 'rev-2' } as AlarmEventPayloadDto['rule'],
            }));
            const duplicateChanged = await duplicateBroadcast;

            expect(duplicateChanged.incident.incidentId).toBe(incidentId);
            expect(duplicateChanged.incident).toMatchObject({
                isActive: true,
                isAcknowledged: true,
                acknowledgedAt: acknowledgedAt.toISOString(),
                acknowledgedBy: userId,
                latestValue: 94,
                latestTs: 1_777_777_011,
                latestDetectedAt: 1_777_777_012,
            });
            await expect(AlarmIncident.countDocuments({
                edgeId: registered.edgeId,
                ruleId: 'pump-temperature-high',
                deviceId: 'pump-1',
                metric: 'temperature',
            }).exec()).resolves.toBe(1);

            const clearBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
            emitAlarmEvent(edgeSocket, buildAlarmEvent(registered.edgeId, {
                eventType: 'clear',
                value: 84,
                ts: 1_777_777_021,
                detectedAt: 1_777_777_022,
                rule: { ruleRevision: 'rev-99' } as AlarmEventPayloadDto['rule'],
            }));
            const clearChanged = await clearBroadcast;

            expect(clearChanged.incident.incidentId).toBe(incidentId);
            expect(clearChanged.incident).toMatchObject({
                isActive: false,
                isAcknowledged: true,
                lifecycleState: 'closed',
                acknowledgedAt: acknowledgedAt.toISOString(),
                acknowledgedBy: userId,
                latestValue: 84,
                latestTs: 1_777_777_021,
                latestDetectedAt: 1_777_777_022,
            });
            expect(clearChanged.incident.clearedAt).toEqual(expect.any(String));

            const incidents = await AlarmIncident.find({
                edgeId: registered.edgeId,
                ruleId: 'pump-temperature-high',
                deviceId: 'pump-1',
                metric: 'temperature',
            }).exec();
            expect(incidents).toHaveLength(1);
            expect(incidents[0]!.isActive).toBe(false);
            expect(incidents[0]!.isAcknowledged).toBe(true);
            expect(incidents[0]!.acknowledgedAt?.toISOString()).toBe(acknowledgedAt.toISOString());
            expect(incidents[0]!.acknowledgedBy?.toHexString()).toBe(userId);
        },
        12000,
    );
});
