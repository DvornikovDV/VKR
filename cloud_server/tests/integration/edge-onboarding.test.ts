import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/database/mongoose';
import { EdgeOnboardingAudit } from '../../src/models/EdgeOnboardingAudit';
import { EdgeServer } from '../../src/models/EdgeServer';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/services/auth.service';
import { verifyCredentialSecret } from '../../src/services/edge-onboarding.service';

let adminToken = '';

async function createAdminToken(email: string): Promise<string> {
    const { user } = await AuthService.register(email, 'password1234');
    await User.findByIdAndUpdate(user._id, { role: 'ADMIN' }).exec();
    const login = await AuthService.login(email, 'password1234');
    return login.token;
}

describe('Edge onboarding integration contract', () => {
    beforeAll(async () => {
        await connectDatabase();
        await User.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        await EdgeOnboardingAudit.deleteMany({}).exec();

        adminToken = await createAdminToken('admin_edge_onboarding@test.com');
    });

    beforeEach(async () => {
        await EdgeServer.deleteMany({}).exec();
        await EdgeOnboardingAudit.deleteMany({}).exec();
    });

    afterAll(async () => {
        await User.deleteMany({}).exec();
        await EdgeServer.deleteMany({}).exec();
        await EdgeOnboardingAudit.deleteMany({}).exec();
        await disconnectDatabase();
    });

    describe('REST onboarding flows', () => {
        it('registers an edge and discloses a one-time onboarding package', async () => {
            const response = await request(app)
                .post('/api/edge-servers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Edge One' });

            expect(response.status).toBe(201);
            expect(response.body.status).toBe('success');
            expect(response.body.data?.edge?.name).toBe('Edge One');
            expect(response.body.data?.edge?.lifecycleState).toBe('Pending First Connection');
            expect(response.body.data?.edge?.isTelemetryReady).toBe(false);
            expect(response.body.data?.onboardingPackage?.edgeId).toBe(response.body.data?.edge?._id);

            const onboardingSecret = response.body.data?.onboardingPackage?.onboardingSecret;
            expect(typeof onboardingSecret).toBe('string');
            expect(onboardingSecret.length).toBeGreaterThan(20);

            const issuedAt = new Date(response.body.data?.onboardingPackage?.issuedAt).getTime();
            const expiresAt = new Date(response.body.data?.onboardingPackage?.expiresAt).getTime();
            expect(expiresAt).toBeGreaterThan(issuedAt);
        });

        it('hides full secret on later fleet reads while keeping package metadata', async () => {
            const registration = await request(app)
                .post('/api/edge-servers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Edge Masking' });

            expect(registration.status).toBe(201);
            const edgeId = registration.body.data?.edge?._id as string;
            const disclosedSecret = registration.body.data?.onboardingPackage?.onboardingSecret as string;
            expect(typeof disclosedSecret).toBe('string');

            const fleet = await request(app)
                .get('/api/admin/edge-servers')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(fleet.status).toBe(200);
            const edgeRecord = (fleet.body.data as Array<Record<string, unknown>>).find(
                (edge) => edge['_id'] === edgeId,
            );

            expect(edgeRecord).toBeTruthy();
            const currentOnboardingPackage = edgeRecord?.['currentOnboardingPackage'] as
                | Record<string, unknown>
                | null
                | undefined;
            expect(currentOnboardingPackage).toBeTruthy();
            expect(currentOnboardingPackage?.['status']).toBe('ready');
            expect(currentOnboardingPackage?.['credentialId']).toBeTypeOf('string');
            expect(currentOnboardingPackage?.['issuedAt']).toBeTypeOf('string');
            expect(currentOnboardingPackage?.['expiresAt']).toBeTypeOf('string');
            expect('onboardingSecret' in (currentOnboardingPackage ?? {})).toBe(false);
            expect('secretHash' in (currentOnboardingPackage ?? {})).toBe(false);
            expect(JSON.stringify(edgeRecord)).not.toContain(disclosedSecret);
        });

        it('resets onboarding package and invalidates previously issued secret', async () => {
            const registration = await request(app)
                .post('/api/edge-servers')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Edge Reset' });

            expect(registration.status).toBe(201);
            const edgeId = registration.body.data?.edge?._id as string;
            const firstSecret = registration.body.data?.onboardingPackage?.onboardingSecret as string;

            const beforeReset = await EdgeServer.findById(edgeId).exec();
            const previousCredentialId = beforeReset?.currentOnboardingPackage?.credentialId ?? null;
            expect(previousCredentialId).toBeTruthy();

            const reset = await request(app)
                .post(`/api/edge-servers/${edgeId}/onboarding/reset`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(reset.status).toBe(200);
            expect(reset.body.status).toBe('success');
            expect(reset.body.data?.edge?._id).toBe(edgeId);
            expect(reset.body.data?.edge?.lifecycleState).toBe('Pending First Connection');

            const secondSecret = reset.body.data?.onboardingPackage?.onboardingSecret as string;
            expect(typeof secondSecret).toBe('string');
            expect(secondSecret).not.toBe(firstSecret);

            const afterReset = await EdgeServer.findById(edgeId).exec();
            const currentPackage = afterReset?.currentOnboardingPackage;
            expect(currentPackage).toBeTruthy();
            expect(currentPackage?.status).toBe('ready');
            expect(currentPackage?.credentialId).not.toBe(previousCredentialId);

            await expect(
                verifyCredentialSecret(firstSecret, currentPackage?.secretHash ?? ''),
            ).resolves.toBe(false);
            await expect(
                verifyCredentialSecret(secondSecret, currentPackage?.secretHash ?? ''),
            ).resolves.toBe(true);
            await expect(
                verifyCredentialSecret(firstSecret, afterReset?.apiKeyHash ?? ''),
            ).resolves.toBe(false);
            await expect(
                verifyCredentialSecret(secondSecret, afterReset?.apiKeyHash ?? ''),
            ).resolves.toBe(true);
        });
    });

    describe('Socket.IO onboarding flows', () => {
        it.todo('accepts first activation with valid onboarding credential');
        it.todo('rejects reused, invalid, or expired onboarding credentials');
        it.todo('accepts trusted reconnect only with persistent credential');
    });
});
