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
    getAlarmIncidentListPayload,
    readAlarmIncidentListResponse,
    registerEdge,
    seedAlarmIncidentRecord,
    stopServerIfStarted,
    waitForAlarmIncidentChanged,
} from './edge-socket.helpers';
import { type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import YAML from 'yamljs';
import { app } from '../../src/app';
import { projectAlarmIncident } from '../../src/services/alarm-incidents.service';

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
            expect(activeChanged.incident.rule).toMatchObject({
                ruleId: 'pump-temperature-high',
                ruleRevision: 'rev-1',
                conditionType: 'high',
                triggerThreshold: 90,
                clearThreshold: 85,
                expectedValue: null,
                severity: 'danger',
                label: 'Pump temperature high',
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
            expect(duplicateChanged.incident.rule).toMatchObject({
                ruleId: 'pump-temperature-high',
                ruleRevision: 'rev-1',
                conditionType: 'high',
                triggerThreshold: 90,
                clearThreshold: 85,
                expectedValue: null,
                severity: 'danger',
                label: 'Pump temperature high',
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
            expect(clearChanged.incident.rule).toMatchObject({
                ruleId: 'pump-temperature-high',
                ruleRevision: 'rev-1',
                conditionType: 'high',
                triggerThreshold: 90,
                clearThreshold: 85,
                expectedValue: null,
                severity: 'danger',
                label: 'Pump temperature high',
            });

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
            expect(incidents[0]!.rule).toMatchObject({
                ruleId: 'pump-temperature-high',
                ruleRevision: 'rev-1',
                conditionType: 'high',
                triggerThreshold: 90,
                clearThreshold: 85,
                expectedValue: null,
                severity: 'danger',
                label: 'Pump temperature high',
            });
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

    it(
        'lists trusted persisted incidents through the HTTP route with defaults, all state, pagination, projection reuse, and limit bounds',
        async () => {
            const registered = await registerEdge(adminToken, 'Alarm Incident List Edge');
            await bindEdgeToUser(adminToken, registered.edgeId, userId);

            const at = (iso: string) => new Date(iso);
            const ms = (iso: string) => at(iso).getTime();
            const activeUnacknowledged = await seedAlarmIncidentRecord({
                edgeId: registered.edgeId,
                sourceId: 'line-1',
                deviceId: 'pump-a',
                metric: 'temperature',
                ruleId: 'active-unacknowledged',
                rule: { ruleId: 'active-unacknowledged', label: 'Active unacknowledged' },
                isActive: true,
                isAcknowledged: false,
                activatedAt: at('2026-05-09T10:01:00.000Z'),
                latestDetectedAt: ms('2026-05-09T10:02:00.000Z'),
                updatedAt: at('2026-05-09T10:02:00.000Z'),
            });
            const activeAcknowledged = await seedAlarmIncidentRecord({
                edgeId: registered.edgeId,
                sourceId: 'line-1',
                deviceId: 'pump-b',
                metric: 'pressure',
                ruleId: 'active-acknowledged',
                rule: { ruleId: 'active-acknowledged', label: 'Active acknowledged' },
                isActive: true,
                isAcknowledged: true,
                acknowledgedAt: at('2026-05-09T10:06:00.000Z'),
                acknowledgedBy: userId,
                activatedAt: at('2026-05-09T10:01:00.000Z'),
                latestDetectedAt: ms('2026-05-09T10:03:00.000Z'),
                updatedAt: at('2026-05-09T10:03:00.000Z'),
            });
            const clearedUnacknowledged = await seedAlarmIncidentRecord({
                edgeId: registered.edgeId,
                sourceId: 'line-2',
                deviceId: 'pump-c',
                metric: 'level',
                ruleId: 'cleared-unacknowledged',
                rule: { ruleId: 'cleared-unacknowledged', label: 'Cleared unacknowledged' },
                isActive: false,
                isAcknowledged: false,
                activatedAt: at('2026-05-09T10:00:00.000Z'),
                clearedAt: at('2026-05-09T10:05:00.000Z'),
                latestDetectedAt: ms('2026-05-09T10:04:00.000Z'),
                updatedAt: at('2026-05-09T10:04:00.000Z'),
            });
            const closed = await seedAlarmIncidentRecord({
                edgeId: registered.edgeId,
                sourceId: 'line-3',
                deviceId: 'pump-d',
                metric: 'vibration',
                ruleId: 'closed',
                rule: { ruleId: 'closed', label: 'Closed' },
                isActive: false,
                isAcknowledged: true,
                acknowledgedAt: at('2026-05-09T10:07:00.000Z'),
                acknowledgedBy: userId,
                activatedAt: at('2026-05-09T10:00:00.000Z'),
                clearedAt: at('2026-05-09T10:04:00.000Z'),
                latestDetectedAt: ms('2026-05-09T10:04:00.000Z'),
                updatedAt: at('2026-05-09T10:04:00.000Z'),
            });

            const unauthenticated = await request(app)
                .get(`/api/edge-servers/${registered.edgeId}/alarm-incidents`);
            expect(unauthenticated.status).toBe(401);

            const denied = await readAlarmIncidentListResponse(untrustedUserToken, registered.edgeId);
            expect(denied.status).toBe(403);

            const defaultResponse = await readAlarmIncidentListResponse(userToken, registered.edgeId);
            const defaultPayload = getAlarmIncidentListPayload(defaultResponse);

            expect(defaultResponse.status).toBe(200);
            expect(defaultPayload).toMatchObject({
                page: 1,
                limit: 50,
                total: 3,
                hasNextPage: false,
            });
            expect(defaultPayload.incidents.map((incident) => incident.ruleId)).toEqual([
                'active-acknowledged',
                'cleared-unacknowledged',
                'active-unacknowledged',
            ]);
            expect(defaultPayload.incidents.map((incident) => incident.incidentId)).not.toContain(
                closed._id.toHexString(),
            );
            expect(defaultPayload.incidents[0]).toEqual(projectAlarmIncident(activeAcknowledged));
            expect(defaultPayload.incidents[1]).toEqual(projectAlarmIncident(clearedUnacknowledged));
            expect(defaultPayload.incidents[2]).toEqual(projectAlarmIncident(activeUnacknowledged));

            const allResponse = await readAlarmIncidentListResponse(userToken, registered.edgeId, {
                state: 'all',
                page: 1,
                limit: 2,
                sort: 'latest',
                order: 'desc',
            });
            const allPayload = getAlarmIncidentListPayload(allResponse);

            expect(allResponse.status).toBe(200);
            expect(allPayload).toMatchObject({
                page: 1,
                limit: 2,
                total: 4,
                hasNextPage: true,
            });
            expect(allPayload.incidents.map((incident) => incident.ruleId)).toEqual([
                'closed',
                'active-acknowledged',
            ]);
            expect(allPayload.incidents[0]).toEqual(projectAlarmIncident(closed));

            const limitBoundViolation = await readAlarmIncidentListResponse(userToken, registered.edgeId, {
                limit: 101,
            });
            expect(limitBoundViolation.status).toBe(400);

            const openapi = YAML.load('openapi.yaml') as {
                paths?: Record<string, {
                    get?: {
                        operationId?: string;
                        security?: unknown;
                        parameters?: Array<{ name?: string }>;
                        responses?: Record<string, unknown>;
                    };
                }>;
                components?: {
                    schemas?: Record<string, {
                        properties?: Record<string, unknown>;
                    }>;
                };
            };
            const documentedList = openapi.paths?.['/api/edge-servers/{edgeId}/alarm-incidents']?.get;

            expect(documentedList).toMatchObject({
                operationId: 'listAlarmIncidents',
                security: [{ bearerAuth: [] }],
                responses: {
                    '200': {
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/AlarmIncidentListResponse' },
                            },
                        },
                    },
                    '400': expect.any(Object),
                    '401': expect.any(Object),
                    '403': expect.any(Object),
                    '404': expect.any(Object),
                },
            });
            expect(documentedList?.parameters?.map((parameter) => parameter.name)).toEqual([
                'edgeId',
                'state',
                'page',
                'limit',
                'sort',
                'order',
            ]);
            expect(openapi.components?.schemas?.['AlarmIncidentListResponse']).toMatchObject({
                properties: {
                    data: {
                        properties: {
                            incidents: {
                                items: { $ref: '#/components/schemas/AlarmIncidentProjection' },
                            },
                        },
                    },
                },
            });
        },
        12000,
    );
});
