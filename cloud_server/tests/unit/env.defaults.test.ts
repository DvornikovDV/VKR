import { describe, expect, it, vi } from 'vitest';

describe('env defaults and overrides', () => {
    it('reads DEFAULT_ADMIN credentials from environment when provided', async () => {
        const prevEmail = process.env['DEFAULT_ADMIN_EMAIL'];
        const prevPassword = process.env['DEFAULT_ADMIN_PASSWORD'];

        try {
            process.env['DEFAULT_ADMIN_EMAIL'] = 'admin@example.com';
            process.env['DEFAULT_ADMIN_PASSWORD'] = 'superlongpassword1234';

            vi.resetModules();
            const { ENV } = await import('../../src/config/env');

            expect(ENV.DEFAULT_ADMIN_EMAIL).toBe('admin@example.com');
            expect(ENV.DEFAULT_ADMIN_PASSWORD).toBe('superlongpassword1234');
        } finally {
            if (prevEmail === undefined) {
                delete process.env['DEFAULT_ADMIN_EMAIL'];
            } else {
                process.env['DEFAULT_ADMIN_EMAIL'] = prevEmail;
            }

            if (prevPassword === undefined) {
                delete process.env['DEFAULT_ADMIN_PASSWORD'];
            } else {
                process.env['DEFAULT_ADMIN_PASSWORD'] = prevPassword;
            }
        }
    });
});
