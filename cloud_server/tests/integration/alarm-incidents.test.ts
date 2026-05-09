import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { AlarmIncident } from '../../src/models/AlarmIncident';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { resetActiveEdgeSocketsForTests } from '../../src/socket/events/edge';
import {
    ALARM_INCIDENT_CHANGED_EVENT_NAME,
    type AlarmEventPayloadDto,
    type AlarmIncidentAckResponseDto,
} from '../../src/types';
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
    let untrustedUserToken = '';

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
        ({ userToken: untrustedUserToken } = await createUserSession('alarm_incidents_untrusted@test.com'));
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

    it(
        'ACKs an incident through the HTTP route, mutates only ACK fields, and broadcasts the update',
        async () => {
            const registered = await registerEdge(adminToken, 'Alarm Incident Ack Edge');
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

            const activeBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
            emitAlarmEvent(edgeSocket, buildAlarmEvent(registered.edgeId, {
                value: 91.25,
                ts: 1_777_777_101,
                detectedAt: 1_777_777_102,
            }));
            const activeChanged = await activeBroadcast;
            const incidentId = activeChanged.incident.incidentId;
            const beforeAck = await AlarmIncident.findById(incidentId).lean().exec();
            expect(beforeAck).not.toBeNull();

            await EdgeServer.findByIdAndUpdate(registered.edgeId, {
                $set: { lifecycleState: 'Blocked' },
            }).exec();

            const deniedResponse = await fetch(
                `${socketBaseUrl}/api/edge-servers/${registered.edgeId}/alarm-incidents/${incidentId}/ack`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${untrustedUserToken}` },
                },
            );
            await expect(expectNoEvent(dashboardSocket, ALARM_INCIDENT_CHANGED_EVENT_NAME)).resolves.toBeUndefined();
            expect(deniedResponse.status).toBe(403);
            await expect(AlarmIncident.findById(incidentId).then((incident) => ({
                isAcknowledged: incident?.isAcknowledged,
                acknowledgedAt: incident?.acknowledgedAt ?? null,
                acknowledgedBy: incident?.acknowledgedBy ?? null,
            }))).resolves.toEqual({
                isAcknowledged: false,
                acknowledgedAt: null,
                acknowledgedBy: null,
            });

            const ackBroadcast = waitForAlarmIncidentChanged(dashboardSocket);
            const response = await fetch(
                `${socketBaseUrl}/api/edge-servers/${registered.edgeId}/alarm-incidents/${incidentId}/ack`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${userToken}` },
                },
            );
            const body = await response.json() as AlarmIncidentAckResponseDto;
            const ackChanged = await ackBroadcast;
            const afterAck = await AlarmIncident.findById(incidentId).lean().exec();

            expect(response.status).toBe(200);
            expect(body).toMatchObject({
                status: 'success',
                data: {
                    incident: {
                        incidentId,
                        edgeId: registered.edgeId,
                        isActive: true,
                        isAcknowledged: true,
                        acknowledgedBy: userId,
                    },
                },
            });
            expect(body.data?.incident?.acknowledgedAt).toEqual(expect.any(String));

            expect(ackChanged.edgeId).toBe(registered.edgeId);
            expect(ackChanged.incident).toMatchObject({
                incidentId,
                edgeId: registered.edgeId,
                isActive: true,
                isAcknowledged: true,
                lifecycleState: 'active_acknowledged',
                acknowledgedBy: userId,
                latestValue: 91.25,
                latestTs: 1_777_777_101,
                latestDetectedAt: 1_777_777_102,
            });
            expect(ackChanged.incident.acknowledgedAt).toEqual(expect.any(String));

            expect(afterAck).not.toBeNull();
            expect(afterAck!.isAcknowledged).toBe(true);
            expect(afterAck!.acknowledgedAt).toBeInstanceOf(Date);
            expect(afterAck!.acknowledgedBy?.toHexString()).toBe(userId);
            expect(afterAck!.isActive).toBe(beforeAck!.isActive);
            expect(afterAck!.clearedAt).toEqual(beforeAck!.clearedAt);
            expect(afterAck!.sourceId).toBe(beforeAck!.sourceId);
            expect(afterAck!.deviceId).toBe(beforeAck!.deviceId);
            expect(afterAck!.metric).toBe(beforeAck!.metric);
            expect(afterAck!.ruleId).toBe(beforeAck!.ruleId);
            expect(afterAck!.latestValue).toBe(beforeAck!.latestValue);
            expect(afterAck!.latestTs).toBe(beforeAck!.latestTs);
            expect(afterAck!.latestDetectedAt).toBe(beforeAck!.latestDetectedAt);
            expect(afterAck!.rule).toEqual(beforeAck!.rule);
        },
        12000,
    );
});
