/**
 * Global test setup.
 * Sets required environment variables BEFORE any module is imported.
 * This prevents env.ts from throwing due to missing required vars.
 */

process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '4001';
process.env['MONGO_URI'] = process.env['TEST_MONGO_URI'] ?? 'mongodb://localhost:27017/vkr_scada_test';
process.env['JWT_SECRET'] = 'test_secret_that_is_definitely_long_enough_32chars';
process.env['JWT_EXPIRES_IN'] = '1h';
process.env['CORS_ORIGINS'] = 'http://localhost:3000';
process.env['MAX_PRO_BINDINGS'] = '0';

const mongoUri = process.env['MONGO_URI'] ?? '';
if (!/(?:^|[/_-])test(?:s)?(?:$|\?)/i.test(mongoUri)) {
    throw new Error(
        `[tests/setup] Unsafe MONGO_URI for tests: "${mongoUri}". ` +
            'Set TEST_MONGO_URI (or MONGO_URI) to an isolated test database URI.',
    );
}
