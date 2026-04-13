import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/services/auth.service';

type EdgeAvailabilitySnapshot = {
    online: boolean;
    lastSeenAt: string | null;
};

type AdminEdgeRecord = {
    _id: string;
    name: string;
    trustedUsers: Array<string | { _id: string; email?: string }>;
    createdBy: { _id: string; email?: string } | null;
    lifecycleState: 'Active' | 'Blocked';
    availability: EdgeAvailabilitySnapshot;
    persistentCredentialVersion: number | null;
    lastLifecycleEventAt: string | null;
    createdAt: string;
};

type EdgeCredentialIssueBody = {
    status: 'success';
    data: {
        edge: AdminEdgeRecord;
        persistentCredential: {
            edgeId: string;
            credentialSecret: string;
            version: number;
            issuedAt: string;
            instructions: string;
        };
    };
};

describe('Admin edge lifecycle REST contract', () => {
    let adminToken = '';
    let adminId = '';
    let userId = '';

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

        const adminAuth = await AuthService.register(
            'admin_edge_lifecycle_contract@test.com',
            'password1234',
        );
        await User.findByIdAndUpdate(adminAuth.user._id, {
            role: 'ADMIN',
            subscriptionTier: 'PRO',
        }).exec();

        const adminLogin = await AuthService.login(
            'admin_edge_lifecycle_contract@test.com',
            'password1234',
        );
        adminToken = adminLogin.token;
        adminId = adminAuth.user._id.toString();

        const user = await User.create({
            email: 'user_edge_lifecycle_contract@test.com',
            passwordHash: 'hash',
            role: 'USER',
            subscriptionTier: 'PRO',
        });
        userId = user._id.toString();
    });

    it('proves register -> rotate-credential -> block -> unblock through REST and keeps lifecycle separate from availability', async () => {
        const registerResponse = await request(app)
            .post('/api/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'REST Lifecycle Edge' });

        expect(registerResponse.status).toBe(201);
        const registerBody = registerResponse.body as EdgeCredentialIssueBody;
        expect(registerBody).toEqual({
            status: 'success',
            data: {
                edge: expect.objectContaining({
                    _id: expect.any(String),
                    name: 'REST Lifecycle Edge',
                    trustedUsers: [],
                    createdBy: expect.objectContaining({
                        _id: adminId,
                    }),
                    lifecycleState: 'Active',
                    availability: {
                        online: false,
                        lastSeenAt: null,
                    },
                    persistentCredentialVersion: 1,
                    lastLifecycleEventAt: expect.any(String),
                    createdAt: expect.any(String),
                }),
                persistentCredential: {
                    edgeId: expect.any(String),
                    credentialSecret: expect.any(String),
                    version: 1,
                    issuedAt: expect.any(String),
                    instructions:
                        'Use this secret as the edge runtime persistent credential for trusted connects and reconnects.',
                },
            },
        });

        const edgeId = registerBody.data.edge._id;

        const pingAfterRegister = await request(app)
            .get(`/api/edge-servers/${edgeId}/ping`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(pingAfterRegister.status).toBe(200);
        expect(pingAfterRegister.body).toEqual({
            status: 'success',
            data: {
                lifecycleState: 'Active',
                availability: {
                    online: false,
                    lastSeenAt: null,
                },
            },
        });

        const rotateResponse = await request(app)
            .post(`/api/edge-servers/${edgeId}/rotate-credential`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(rotateResponse.status).toBe(200);
        const rotateBody = rotateResponse.body as EdgeCredentialIssueBody;
        expect(rotateBody).toEqual({
            status: 'success',
            data: {
                edge: expect.objectContaining({
                    _id: edgeId,
                    lifecycleState: 'Active',
                    availability: {
                        online: false,
                        lastSeenAt: null,
                    },
                    persistentCredentialVersion: 2,
                    lastLifecycleEventAt: expect.any(String),
                    createdAt: expect.any(String),
                }),
                persistentCredential: {
                    edgeId,
                    credentialSecret: expect.any(String),
                    version: 2,
                    issuedAt: expect.any(String),
                    instructions:
                        'Use this secret as the edge runtime persistent credential for trusted connects and reconnects.',
                },
            },
        });
        expect(rotateBody.data.persistentCredential.credentialSecret).not.toBe(
            registerBody.data.persistentCredential.credentialSecret,
        );

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
                    availability: {
                        online: false,
                        lastSeenAt: null,
                    },
                    persistentCredentialVersion: 2,
                    lastLifecycleEventAt: expect.any(String),
                    createdAt: expect.any(String),
                }),
            },
        });
        expect(blockResponse.body.data.persistentCredential).toBeUndefined();

        const pingAfterBlock = await request(app)
            .get(`/api/edge-servers/${edgeId}/ping`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(pingAfterBlock.status).toBe(200);
        expect(pingAfterBlock.body).toEqual({
            status: 'success',
            data: {
                lifecycleState: 'Blocked',
                availability: {
                    online: false,
                    lastSeenAt: null,
                },
            },
        });

        const unblockResponse = await request(app)
            .post(`/api/edge-servers/${edgeId}/unblock`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(unblockResponse.status).toBe(200);
        const unblockBody = unblockResponse.body as EdgeCredentialIssueBody;
        expect(unblockBody).toEqual({
            status: 'success',
            data: {
                edge: expect.objectContaining({
                    _id: edgeId,
                    lifecycleState: 'Active',
                    availability: {
                        online: false,
                        lastSeenAt: null,
                    },
                    persistentCredentialVersion: 3,
                    lastLifecycleEventAt: expect.any(String),
                    createdAt: expect.any(String),
                }),
                persistentCredential: {
                    edgeId,
                    credentialSecret: expect.any(String),
                    version: 3,
                    issuedAt: expect.any(String),
                    instructions:
                        'Use this secret as the edge runtime persistent credential for trusted connects and reconnects.',
                },
            },
        });
        expect(unblockBody.data.persistentCredential.credentialSecret).not.toBe(
            rotateBody.data.persistentCredential.credentialSecret,
        );

        const pingAfterUnblock = await request(app)
            .get(`/api/edge-servers/${edgeId}/ping`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(pingAfterUnblock.status).toBe(200);
        expect(pingAfterUnblock.body).toEqual({
            status: 'success',
            data: {
                lifecycleState: 'Active',
                availability: {
                    online: false,
                    lastSeenAt: null,
                },
            },
        });
    });

    it('returns lifecycle-aware admin fleet data and keeps credential disclosure limited to register, rotate, and unblock', async () => {
        const registerResponse = await request(app)
            .post('/api/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ name: 'Fleet Lifecycle Edge' });

        expect(registerResponse.status).toBe(201);
        const edgeId = (registerResponse.body as EdgeCredentialIssueBody).data.edge._id;

        const bindResponse = await request(app)
            .post(`/api/edge-servers/${edgeId}/bind`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ userId });

        expect(bindResponse.status).toBe(200);
        expect(bindResponse.body).toEqual({
            status: 'success',
            data: expect.objectContaining({
                _id: edgeId,
                lifecycleState: 'Active',
                availability: {
                    online: false,
                    lastSeenAt: null,
                },
                persistentCredentialVersion: 1,
                trustedUsers: [
                    expect.objectContaining({
                        _id: userId,
                        email: 'user_edge_lifecycle_contract@test.com',
                    }),
                ],
                createdBy: expect.objectContaining({
                    _id: adminId,
                }),
            }),
        });
        expect(bindResponse.body.data.persistentCredential).toBeUndefined();

        const fleetBeforeBlock = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(fleetBeforeBlock.status).toBe(200);
        expect(fleetBeforeBlock.body).toEqual({
            status: 'success',
            data: [
                expect.objectContaining({
                    _id: edgeId,
                    name: 'Fleet Lifecycle Edge',
                    lifecycleState: 'Active',
                    availability: {
                        online: false,
                        lastSeenAt: null,
                    },
                    persistentCredentialVersion: 1,
                    trustedUsers: [
                        expect.objectContaining({
                            _id: userId,
                            email: 'user_edge_lifecycle_contract@test.com',
                        }),
                    ],
                    createdBy: expect.objectContaining({
                        _id: adminId,
                    }),
                }),
            ],
        });
        expect(fleetBeforeBlock.body.data[0]?.persistentCredential).toBeUndefined();
        expect(fleetBeforeBlock.body.data[0]?.credentialSecret).toBeUndefined();

        const blockResponse = await request(app)
            .post(`/api/edge-servers/${edgeId}/block`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(blockResponse.status).toBe(200);

        const fleetAfterBlock = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(fleetAfterBlock.status).toBe(200);
        expect(fleetAfterBlock.body).toEqual({
            status: 'success',
            data: [
                expect.objectContaining({
                    _id: edgeId,
                    lifecycleState: 'Blocked',
                    availability: {
                        online: false,
                        lastSeenAt: null,
                    },
                    persistentCredentialVersion: 1,
                }),
            ],
        });

        const unblockResponse = await request(app)
            .post(`/api/edge-servers/${edgeId}/unblock`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(unblockResponse.status).toBe(200);

        const fleetAfterUnblock = await request(app)
            .get('/api/admin/edge-servers')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(fleetAfterUnblock.status).toBe(200);
        expect(fleetAfterUnblock.body).toEqual({
            status: 'success',
            data: [
                expect.objectContaining({
                    _id: edgeId,
                    lifecycleState: 'Active',
                    availability: {
                        online: false,
                        lastSeenAt: null,
                    },
                    persistentCredentialVersion: 2,
                }),
            ],
        });
    });
});
