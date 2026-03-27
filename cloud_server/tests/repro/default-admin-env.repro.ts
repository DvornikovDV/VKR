import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const cjsRequire = createRequire(__filename);

function loadEnvModule(): typeof import('../../src/config/env') {
    const modulePath = path.resolve(process.cwd(), 'src/config/env.ts');
    delete cjsRequire.cache[modulePath];
    return cjsRequire(modulePath) as typeof import('../../src/config/env');
}

export async function run(): Promise<void> {
    process.env['DEFAULT_ADMIN_EMAIL'] = 'admin@example.com';
    process.env['DEFAULT_ADMIN_PASSWORD'] = 'superlongpassword1234';

    const { ENV } = loadEnvModule();

    assert.equal(ENV.DEFAULT_ADMIN_EMAIL, 'admin@example.com');
    assert.equal(ENV.DEFAULT_ADMIN_PASSWORD, 'superlongpassword1234');
}
