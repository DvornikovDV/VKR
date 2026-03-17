import { describe, it, expect } from 'vitest';
import { provisionDefaultAdmin, validateDefaultAdminCredentials } from '../../src/scripts/seed';

describe('seed script', () => {
    it('validates default admin credentials', () => {
        expect(() =>
            validateDefaultAdminCredentials('not-an-email', 'very_secure_admin_pass_1234'),
        ).toThrow(/valid email/i);
        expect(() =>
            validateDefaultAdminCredentials('admin@example.com', 'short-password'),
        ).toThrow(/at least 16 characters/i);
    });

    it('creates default admin when user does not exist', async () => {
        let createdPayload: Record<string, unknown> | null = null;
        const outcome = await provisionDefaultAdmin({
            credentials: {
                email: 'admin@example.com',
                password: 'very_secure_admin_pass_1234',
            },
            userModel: {
                findOne: async () => null,
                create: async (payload: Record<string, unknown>) => {
                    createdPayload = payload;
                    return payload;
                },
                updateOne: async () => ({}),
            },
            hashPassword: async () => 'hashed-password',
            logger: { log: () => undefined, warn: () => undefined },
        });

        expect(outcome).toBe('created');
        expect(createdPayload?.['email']).toBe('admin@example.com');
        expect(createdPayload?.['role']).toBe('ADMIN');
    });
});
