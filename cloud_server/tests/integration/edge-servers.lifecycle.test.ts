import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { app } from '../../src/app';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/services/auth.service';
import { EdgeServersService } from '../../src/services/edge-servers.service';
import request from 'supertest';

type EdgeCredentialIssueResult = {
    edge: {
        _id: string;
        lifecycleState: 'Active' | 'Blocked';
        availability: { online: boolean; lastSeenAt: string | null };
        persistentCredentialVersion: number | null;
        lastLifecycleEventAt: string | null;
        createdAt: string;
    };
    persistentCredential: {
        edgeId: string;
        credentialSecret: string;
        version: number;
        issuedAt: string;
    };
};

function requireServiceMethod<T extends (...args: never[]) => unknown>(
    name: string,
): T {
    const candidate = (EdgeServersService as unknown as Record<string, unknown>)[name];
    if (typeof candidate !== 'function') {
        throw new Error(`Expected EdgeServersService.${name} to exist`);
    }
    return candidate as T;
}

describe('Edge lifecycle persistence and fleet projections', () => {
    let adminId = '';
    let userId = '';
    let adminToken = '';

    beforeAll(async () => {
        await connectDatabase();
    });

    afterAll(async () => {
        await EdgeServer.deleteMany({});
        await User.deleteMany({});
        await disconnectDatabase();
    });

    beforeEach(async () => {
        await EdgeServer.deleteMany({});
        await User.deleteMany({});

        const adminAuth = await AuthService.register('edge_lifecycle_admin@test.com', 'password1234');
        await User.findByIdAndUpdate(adminAuth.user._id, {
            role: 'ADMIN',
            subscriptionTier: 'PRO',
        }).exec();
        const adminLogin = await AuthService.login('edge_lifecycle_admin@test.com', 'password1234');
        adminToken = adminLogin.token;
        const user = await User.create({
            email: 'edge_lifecycle_user@test.com',
            passwordHash: 'hash',
            role: 'USER',
            subscriptionTier: 'PRO',
        });

        adminId = adminAuth.user._id.toString();
        userId = user._id.toString();
    });

    it('persists register as Active + offline and projects the edge for both admin and trusted user fleets', async () => {
        const registerEdgeServer = requireServiceMethod<
            (name: string, adminId: string) => Promise<EdgeCredentialIssueResult>
        >('registerEdgeServer');

        const registered = await registerEdgeServer('Lifecycle Edge', adminId);
        await EdgeServersService.assignUserToEdge(registered.edge._id, userId);

        const persisted = await EdgeServer.findById(registered.edge._id).lean().exec();
        expect(persisted?.lifecycleState).toBe('Active');
        expect(persisted?.availability).toEqual({ online: false, lastSeenAt: null });

        const adminFleet = await EdgeServersService.listAllForAdmin();
        expect(adminFleet).toEqual([
            expect.objectContaining({
                _id: registered.edge._id,
                lifecycleState: 'Active',
                availability: { online: false, lastSeenAt: null },
                persistentCredentialVersion: 1,
                lastLifecycleEventAt: expect.any(String),
                createdAt: expect.any(String),
            }),
        ]);

        const userFleet = await EdgeServersService.listForUser(userId);
        expect(userFleet).toEqual([
            expect.objectContaining({
                _id: registered.edge._id,
                lifecycleState: 'Active',
                availability: { online: false, lastSeenAt: null },
                createdAt: expect.any(String),
            }),
        ]);
    });

    it('keeps rotation Active, moves block to Blocked, and returns unblock to Active in persistence and projections', async () => {
        const registerEdgeServer = requireServiceMethod<
            (name: string, adminId: string) => Promise<EdgeCredentialIssueResult>
        >('registerEdgeServer');
        const rotateEdgeCredential = requireServiceMethod<
            (edgeId: string, adminId: string) => Promise<EdgeCredentialIssueResult>
        >('rotateEdgeCredential');
        const blockEdgeServer = requireServiceMethod<
            (edgeId: string, adminId: string) => Promise<{ edge: { lifecycleState: 'Blocked' } }>
        >('blockEdgeServer');
        const unblockEdgeServer = requireServiceMethod<
            (edgeId: string, adminId: string) => Promise<EdgeCredentialIssueResult>
        >('unblockEdgeServer');

        const registered = await registerEdgeServer('Lifecycle State Edge', adminId);
        await EdgeServersService.assignUserToEdge(registered.edge._id, userId);

        const rotated = await rotateEdgeCredential(registered.edge._id, adminId);
        expect(rotated.edge.lifecycleState).toBe('Active');
        expect(rotated.persistentCredential.version).toBe(2);

        const blocked = await blockEdgeServer(registered.edge._id, adminId);
        expect(blocked.edge.lifecycleState).toBe('Blocked');

        let persisted = await EdgeServer.findById(registered.edge._id).lean().exec();
        expect(persisted?.lifecycleState).toBe('Blocked');

        let userFleet = await EdgeServersService.listForUser(userId);
        expect(userFleet).toEqual([
            expect.objectContaining({
                _id: registered.edge._id,
                lifecycleState: 'Blocked',
                availability: { online: false, lastSeenAt: null },
            }),
        ]);

        const unblocked = await unblockEdgeServer(registered.edge._id, adminId);
        expect(unblocked.edge.lifecycleState).toBe('Active');
        expect(unblocked.persistentCredential.version).toBe(3);

        persisted = await EdgeServer.findById(registered.edge._id).lean().exec();
        expect(persisted?.lifecycleState).toBe('Active');
        expect(persisted?.persistentCredential).toMatchObject({
            version: 3,
        });

        userFleet = await EdgeServersService.listForUser(userId);
        expect(userFleet).toEqual([
            expect.objectContaining({
                _id: registered.edge._id,
                lifecycleState: 'Active',
                availability: { online: false, lastSeenAt: null },
                createdAt: expect.any(String),
            }),
        ]);
    });

    it('returns contract-aligned lifecycle responses with string timestamps and wrapped block payload', async () => {
        const registerResponse = await request(app)
            .post('/api/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Lifecycle Contract Edge' });

        expect(registerResponse.status).toBe(201);
        expect(registerResponse.body.data.edge).toEqual(
            expect.objectContaining({
                lifecycleState: 'Active',
                availability: { online: false, lastSeenAt: null },
                lastLifecycleEventAt: expect.any(String),
                createdAt: expect.any(String),
            }),
        );

        const edgeId = registerResponse.body.data.edge._id as string;
        const blockResponse = await request(app)
            .post(`/api/edge-servers/${edgeId}/block`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(blockResponse.status).toBe(200);
        expect(blockResponse.body).toEqual({
            status: 'success',
            data: {
                edge: expect.objectContaining({
                    _id: edgeId,
                    lifecycleState: 'Blocked',
                    availability: { online: false, lastSeenAt: null },
                    lastLifecycleEventAt: expect.any(String),
                    createdAt: expect.any(String),
                }),
            },
        });
    });
});
