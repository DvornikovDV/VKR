import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import YAML from 'yamljs';

import { app } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeServer } from '../../src/models/EdgeServer';
import { Telemetry } from '../../src/models/Telemetry';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/services/auth.service';

const PASSWORD = 'password1234';

let trustedUserId = '';
let trustedUserToken = '';
let untrustedUserToken = '';
let adminToken = '';

function hoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function numericRollup(input: {
    min: number;
    max: number;
    sum: number;
    count: number;
    avg: number;
    last: number;
}) {
    return {
        kind: 'numeric' as const,
        ...input,
    };
}

async function createUserSession(email: string): Promise<{ userId: string; token: string }> {
    const { user } = await AuthService.register(email, PASSWORD);
    const { token } = await AuthService.login(email, PASSWORD);

    return {
        userId: user._id.toString(),
        token,
    };
}

async function createAdminSession(email: string): Promise<string> {
    const { user } = await AuthService.register(email, PASSWORD);
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN', subscriptionTier: 'PRO' }).exec();
    const { token } = await AuthService.login(email, PASSWORD);

    return token;
}

describe('telemetry history HTTP route', () => {
    beforeAll(async () => {
        await connectDatabase();
        await Promise.all([
            User.deleteMany({}).exec(),
            EdgeServer.deleteMany({}).exec(),
            Telemetry.deleteMany({}).exec(),
        ]);

        const trusted = await createUserSession('telemetry_history_trusted@test.com');
        trustedUserId = trusted.userId;
        trustedUserToken = trusted.token;

        const untrusted = await createUserSession('telemetry_history_untrusted@test.com');
        untrustedUserToken = untrusted.token;

        adminToken = await createAdminSession('telemetry_history_admin@test.com');
    });

    beforeEach(async () => {
        await Promise.all([
            EdgeServer.deleteMany({}).exec(),
            Telemetry.deleteMany({}).exec(),
        ]);
    });

    afterAll(async () => {
        await Promise.all([
            Telemetry.deleteMany({}).exec(),
            EdgeServer.deleteMany({}).exec(),
            User.deleteMany({}).exec(),
        ]);
        await disconnectDatabase();
    });

    it('returns trusted numeric aggregates through the real route and keeps the OpenAPI contract aligned', async () => {
        const edge = await EdgeServer.create({
            name: 'Telemetry History Edge',
            trustedUsers: [trustedUserId],
            createdBy: null,
        });
        const edgeId = edge._id.toString();
        const dateStart = hoursAgo(3);
        const firstTimestamp = new Date(dateStart.getTime() + 10_000);
        const secondTimestamp = new Date(dateStart.getTime() + 20_000);
        const dateEnd = hoursAgo(1);

        await Telemetry.insertMany([
            {
                timestamp: firstTimestamp,
                metadata: { edgeId, deviceId: 'pump-1' },
                metric: 'temperature',
                rollup: numericRollup({ min: 10, max: 20, sum: 60, count: 3, avg: 20, last: 20 }),
            },
            {
                timestamp: secondTimestamp,
                metadata: { edgeId, deviceId: 'pump-1' },
                metric: 'temperature',
                rollup: numericRollup({ min: 30, max: 40, sum: 40, count: 1, avg: 40, last: 40 }),
            },
            {
                timestamp: secondTimestamp,
                metadata: { edgeId, deviceId: 'pump-1' },
                metric: 'running',
                rollup: {
                    kind: 'boolean',
                    trueCount: 1,
                    falseCount: 0,
                    count: 1,
                    last: true,
                },
            },
            {
                timestamp: secondTimestamp,
                metadata: { edgeId, deviceId: 'pump-2' },
                metric: 'temperature',
                rollup: numericRollup({ min: 99, max: 99, sum: 99, count: 1, avg: 99, last: 99 }),
            },
        ]);

        const defaultResponse = await request(app)
            .get('/api/telemetry/historic')
            .set('Authorization', `Bearer ${trustedUserToken}`)
            .query({
                edgeId,
                deviceId: 'pump-1',
                metric: 'temperature',
                date_start: dateStart.toISOString(),
                date_end: dateEnd.toISOString(),
            });

        expect(defaultResponse.status).toBe(200);
        expect(defaultResponse.body).toMatchObject({
            status: 'success',
            data: {
                edgeId,
                deviceId: 'pump-1',
                metric: 'temperature',
                dateStart: dateStart.toISOString(),
                dateEnd: dateEnd.toISOString(),
                maxPoints: 300,
            },
        });
        expect(defaultResponse.body.data.series).toHaveLength(2);
        expect(defaultResponse.body.data.series[0]).toEqual({
            timeStart: firstTimestamp.toISOString(),
            timeEnd: firstTimestamp.toISOString(),
            pointTime: firstTimestamp.toISOString(),
            min: 10,
            max: 20,
            avg: 20,
            last: 20,
            count: 3,
        });
        expect(defaultResponse.body.data.series[1]).toMatchObject({
            timeStart: secondTimestamp.toISOString(),
            timeEnd: secondTimestamp.toISOString(),
            min: 30,
            max: 40,
            avg: 40,
            last: 40,
            count: 1,
        });

        const weightedResponse = await request(app)
            .get('/api/telemetry/historic')
            .set('Authorization', `Bearer ${trustedUserToken}`)
            .query({
                edgeId,
                deviceId: 'pump-1',
                metric: 'temperature',
                date_start: dateStart.toISOString(),
                date_end: dateEnd.toISOString(),
                maxPoints: 1,
            });

        expect(weightedResponse.status).toBe(200);
        expect(weightedResponse.body.data.series).toEqual([
            {
                timeStart: firstTimestamp.toISOString(),
                timeEnd: secondTimestamp.toISOString(),
                pointTime: new Date((firstTimestamp.getTime() + secondTimestamp.getTime()) / 2).toISOString(),
                min: 10,
                max: 40,
                avg: 25,
                last: 40,
                count: 4,
            },
        ]);

        const deniedResponse = await request(app)
            .get('/api/telemetry/historic')
            .set('Authorization', `Bearer ${untrustedUserToken}`)
            .query({
                edgeId,
                deviceId: 'pump-1',
                metric: 'temperature',
                date_start: dateStart.toISOString(),
                date_end: dateEnd.toISOString(),
                maxPoints: 1,
            });
        expect(deniedResponse.status).toBe(403);
        expect(deniedResponse.body).toEqual({
            status: 'error',
            message: expect.stringMatching(/trusted/i),
        });

        const adminResponse = await request(app)
            .get('/api/telemetry/historic')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({
                edgeId,
                deviceId: 'pump-1',
                metric: 'temperature',
                date_start: dateStart.toISOString(),
                date_end: dateEnd.toISOString(),
            });
        expect(adminResponse.status).toBe(403);

        const maxPointsResponse = await request(app)
            .get('/api/telemetry/historic')
            .set('Authorization', `Bearer ${trustedUserToken}`)
            .query({
                edgeId,
                deviceId: 'pump-1',
                metric: 'temperature',
                date_start: dateStart.toISOString(),
                date_end: dateEnd.toISOString(),
                maxPoints: 1001,
            });
        expect(maxPointsResponse.status).toBe(400);
        expect(maxPointsResponse.body).toEqual({
            status: 'error',
            message: expect.stringMatching(/maxPoints/i),
        });

        const openapi = YAML.load('openapi.yaml') as {
            paths?: Record<string, {
                get?: {
                    operationId?: string;
                    security?: unknown;
                    parameters?: Array<{ name?: string }>;
                    responses?: Record<string, unknown>;
                };
            }>;
            components?: { schemas?: Record<string, unknown> };
        };
        const documentedRoute = openapi.paths?.['/api/telemetry/historic']?.get;

        expect(documentedRoute).toMatchObject({
            operationId: 'getHistoricTelemetry',
            security: [{ bearerAuth: [] }],
            responses: {
                '200': {
                    content: {
                        'application/json': {
                            schema: { $ref: '#/components/schemas/TelemetryHistoryResponse' },
                        },
                    },
                },
                '400': expect.any(Object),
                '401': expect.any(Object),
                '403': expect.any(Object),
                '404': expect.any(Object),
            },
        });
        expect(documentedRoute?.parameters?.map((parameter) => parameter.name)).toEqual([
            'edgeId',
            'deviceId',
            'metric',
            'date_start',
            'date_end',
            'maxPoints',
        ]);
        expect(openapi.components?.schemas?.['TelemetryHistoryResponse']).toMatchObject({
            properties: {
                data: {
                    properties: {
                        series: {
                            items: { $ref: '#/components/schemas/TelemetryHistoryPoint' },
                        },
                    },
                },
            },
        });
    });

    it('rejects out-of-window ranges with a bounded 400 and no telemetry rows', async () => {
        const edge = await EdgeServer.create({
            name: 'Telemetry History Retention Edge',
            trustedUsers: [trustedUserId],
            createdBy: null,
        });
        const edgeId = edge._id.toString();

        await Telemetry.create({
            timestamp: hoursAgo(1),
            metadata: { edgeId, deviceId: 'pump-1' },
            metric: 'temperature',
            rollup: numericRollup({ min: 10, max: 10, sum: 10, count: 1, avg: 10, last: 10 }),
        });

        const response = await request(app)
            .get('/api/telemetry/historic')
            .set('Authorization', `Bearer ${trustedUserToken}`)
            .query({
                edgeId,
                deviceId: 'pump-1',
                metric: 'temperature',
                date_start: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
                date_end: hoursAgo(1).toISOString(),
            });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            status: 'error',
            message: expect.stringMatching(/retention window/i),
        });
        expect(response.body.data).toBeUndefined();
    });
});
