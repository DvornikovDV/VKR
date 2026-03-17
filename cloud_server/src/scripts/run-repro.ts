import fs from 'node:fs';
import path from 'node:path';

type ReproModule = {
    default?: (() => unknown | Promise<unknown>) | Record<string, unknown>;
    run?: () => unknown | Promise<unknown>;
};

function resolveFromRoot(relativePath: string): string {
    return path.resolve(process.cwd(), relativePath);
}

function loadOptionalSetup(): void {
    const setupPath = resolveFromRoot('tests/setup.ts');

    if (fs.existsSync(setupPath)) {
        require(setupPath);
    }
}

function getRunnableExport(mod: ReproModule): (() => unknown | Promise<unknown>) | null {
    if (typeof mod.run === 'function') {
        return mod.run;
    }

    if (typeof mod.default === 'function') {
        return mod.default;
    }

    return null;
}

async function run(): Promise<void> {
    const reproArg = process.argv[2];

    if (!reproArg) {
        throw new Error('Usage: npm run repro -- <path-to-repro.ts>');
    }

    const reproPath = resolveFromRoot(reproArg);

    if (!fs.existsSync(reproPath)) {
        throw new Error(`Repro file not found: ${reproArg}`);
    }

    loadOptionalSetup();

    const loaded = require(reproPath) as ReproModule;
    const runnable = getRunnableExport(loaded);

    if (runnable) {
        await runnable();
    }

    console.log(`[repro] PASS ${path.relative(process.cwd(), reproPath)}`);
}

void run().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[repro] FAIL ${message}`);
    process.exit(1);
});
