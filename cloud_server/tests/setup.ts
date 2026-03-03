/**
 * Global test setup.
 * Sets required environment variables BEFORE any module is imported.
 * This prevents env.ts from throwing due to missing required vars.
 */

process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '4001';
process.env['MONGO_URI'] = 'mongodb://localhost:27017/vkr_scada_test';
process.env['JWT_SECRET'] = 'test_secret_that_is_definitely_long_enough_32chars';
process.env['JWT_EXPIRES_IN'] = '1h';
process.env['CORS_ORIGINS'] = 'http://localhost:3000';
process.env['MAX_PRO_BINDINGS'] = '0';
