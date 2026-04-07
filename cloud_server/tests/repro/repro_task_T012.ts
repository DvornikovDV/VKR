import { spawnSync } from 'node:child_process';

export async function run(): Promise<void> {
    const cwd = process.cwd();
    const isWin = process.platform === 'win32';
    const command = isWin ? 'cmd' : 'npm';
    const args = isWin
        ? [
            '/c',
            'npm',
            'run',
            'test',
            '--',
            'tests/integration/edge-onboarding.test.ts',
            'tests/unit/edge-onboarding.service.test.ts',
            '--testNamePattern',
            'T012-',
        ]
        : [
            'run',
            'test',
            '--',
            'tests/integration/edge-onboarding.test.ts',
            'tests/unit/edge-onboarding.service.test.ts',
            '--testNamePattern',
            'T012-',
        ];

    const result = spawnSync(command, args, {
        cwd,
        env: process.env,
        encoding: 'utf8',
    });

    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }

    if (result.status !== 0) {
        throw new Error(`T012 repro command failed with exit code ${result.status}`);
    }
}
