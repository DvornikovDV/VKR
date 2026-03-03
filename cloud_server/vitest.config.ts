import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
        typecheck: {
            tsconfig: './tsconfig.test.json',
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/app.ts'],
        },
        testTimeout: 10_000,
        // Run integration test files sequentially to avoid race conditions on
        // the shared MongoDB test database (concurrent deleteMany() across files
        // caused false 404 failures in earlier parallel execution).
        projects: [
            {
                test: {
                    name: 'unit',
                    include: ['tests/unit/**/*.test.ts'],
                },
            },
            {
                test: {
                    name: 'integration',
                    include: ['tests/integration/**/*.test.ts'],
                    // Sequential: each integration test file gets exclusive DB access
                    fileParallelism: false,
                    sequence: { concurrent: false },
                },
            },
        ],
    },
});
