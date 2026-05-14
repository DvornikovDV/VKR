import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { CommandAudit } from '../../src/models/CommandAudit';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import {
    bindEdgeToUser,
    createAdminSession,
    createUserSession,
    getCommandAuditListPayload,
    readCommandAuditListResponse,
    registerEdge,
    seedCommandAuditRecord,
} from './edge-socket.helpers';

describe('GET /api/edge-servers/:edgeId/command-audit', () => {
    let adminToken = '';
    let userId = '';
    let userToken = '';
    let untrustedUserId = '';
    let untrustedUserToken = '';

    beforeAll(async () => {
        await connectDatabase();
        await User.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        await CommandAudit.deleteMany({}).exec();

        ({ adminToken } = await createAdminSession('command_audit_admin@test.com'));
        ({ userId, userToken } = await createUserSession('command_audit_user@test.com'));
        ({ userId: untrustedUserId, userToken: untrustedUserToken } = await createUserSession(
            'command_audit_untrusted@test.com',
        ));
    });

    beforeEach(async () => {
        await CommandAudit.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
    });

    afterAll(async () => {
        await CommandAudit.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        await User.deleteMany({}).exec();
        await disconnectDatabase();
    });

    it('T006: lists trusted audits through the route with projection, status filtering, sorting, and pagination', async () => {
        const registered = await registerEdge(adminToken, 'Command Audit List Edge');
        await bindEdgeToUser(adminToken, registered.edgeId, userId);
        const otherEdge = await registerEdge(adminToken, 'Command Audit Other Edge');

        const olderConfirmed = await seedCommandAuditRecord({
            edgeId: registered.edgeId,
            requestedBy: userId,
            requestId: 'audit-confirmed-older',
            deviceId: 'pump-1',
            commandType: 'set_bool',
            payload: { value: true },
            status: 'confirmed',
            requestedAt: '2026-05-14T08:00:00.000Z',
            completedAt: '2026-05-14T08:00:05.000Z',
        });
        const failedSameTime = await seedCommandAuditRecord({
            edgeId: registered.edgeId,
            requestedBy: userId,
            requestId: 'audit-failed-same-time',
            deviceId: 'pump-2',
            commandType: 'set_number',
            payload: { value: 12.5 },
            status: 'failed',
            failureReason: 'edge_command_failed',
            requestedAt: '2026-05-14T08:05:00.000Z',
            completedAt: '2026-05-14T08:05:03.000Z',
        });
        const newestFailed = await seedCommandAuditRecord({
            edgeId: registered.edgeId,
            requestedBy: userId,
            requestId: 'audit-failed-newest',
            deviceId: 'pump-3',
            commandType: 'set_bool',
            payload: { value: false },
            status: 'failed',
            failureReason: 'edge_unavailable',
            requestedAt: '2026-05-14T08:07:00.000Z',
            completedAt: '2026-05-14T08:07:01.000Z',
        });
        await seedCommandAuditRecord({
            edgeId: otherEdge.edgeId,
            requestedBy: userId,
            requestId: 'audit-other-edge',
            status: 'failed',
            requestedAt: '2026-05-14T08:09:00.000Z',
        });

        const response = await readCommandAuditListResponse(userToken, registered.edgeId, {
            status: 'failed',
            page: 1,
            limit: 1,
        });
        const payload = getCommandAuditListPayload(response);

        expect(response.status).toBe(200);
        expect(payload).toMatchObject({
            page: 1,
            limit: 1,
            total: 2,
            hasNextPage: true,
        });
        expect(payload.audits).toEqual([{
            requestId: newestFailed.requestId,
            edgeId: registered.edgeId,
            deviceId: 'pump-3',
            commandType: 'set_bool',
            payload: { value: false },
            requestedBy: userId,
            requestedByEmail: 'command_audit_user@test.com',
            requestedAt: '2026-05-14T08:07:00.000Z',
            status: 'failed',
            completedAt: '2026-05-14T08:07:01.000Z',
            failureReason: 'edge_unavailable',
        }]);

        const nextResponse = await readCommandAuditListResponse(userToken, registered.edgeId, {
            status: 'failed',
            page: 2,
            limit: 1,
        });
        const nextPayload = getCommandAuditListPayload(nextResponse);

        expect(nextResponse.status).toBe(200);
        expect(nextPayload).toMatchObject({
            page: 2,
            limit: 1,
            total: 2,
            hasNextPage: false,
        });
        expect(nextPayload.audits).toEqual([{
            requestId: failedSameTime.requestId,
            edgeId: registered.edgeId,
            deviceId: 'pump-2',
            commandType: 'set_number',
            payload: { value: 12.5 },
            requestedBy: userId,
            requestedByEmail: 'command_audit_user@test.com',
            requestedAt: '2026-05-14T08:05:00.000Z',
            status: 'failed',
            completedAt: '2026-05-14T08:05:03.000Z',
            failureReason: 'edge_command_failed',
        }]);

        const unfilteredResponse = await readCommandAuditListResponse(userToken, registered.edgeId);
        const unfilteredPayload = getCommandAuditListPayload(unfilteredResponse);

        expect(unfilteredResponse.status).toBe(200);
        expect(unfilteredPayload.total).toBe(3);
        expect(unfilteredPayload.audits.map((audit) => audit.requestId)).toEqual([
            newestFailed.requestId,
            failedSameTime.requestId,
            olderConfirmed.requestId,
        ]);
        expect(unfilteredPayload.audits).not.toContainEqual(
            expect.objectContaining({ requestId: 'audit-other-edge' }),
        );
    });

    it('T007: denies untrusted USER access through the route without leaking audit rows', async () => {
        const registered = await registerEdge(adminToken, 'Command Audit Denied Edge');
        await bindEdgeToUser(adminToken, registered.edgeId, userId);
        await seedCommandAuditRecord({
            edgeId: registered.edgeId,
            requestedBy: userId,
            requestId: 'audit-secret-row',
            status: 'confirmed',
        });
        await seedCommandAuditRecord({
            edgeId: registered.edgeId,
            requestedBy: untrustedUserId,
            requestId: 'audit-untrusted-requester-row',
            status: 'failed',
        });

        const denied = await readCommandAuditListResponse(untrustedUserToken, registered.edgeId);

        expect(denied.status).toBe(403);
        expect(denied.body?.data?.audits).toBeUndefined();
        expect(JSON.stringify(denied.body)).not.toContain('audit-secret-row');
        expect(JSON.stringify(denied.body)).not.toContain('audit-untrusted-requester-row');
    });
});
