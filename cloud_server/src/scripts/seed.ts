import bcrypt from 'bcrypt';
import { ENV } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../database/mongoose';
import { User, type IUser } from '../models/User';

const DEFAULT_ADMIN_PASSWORD_MIN_LENGTH = 16;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const BCRYPT_ROUNDS = 12;

type SeedOutcome = 'skipped' | 'created' | 'updated' | 'exists';

type SeedLogger = Pick<Console, 'log' | 'warn'>;

type SeedUserModel = {
    findOne: (query: { email: string }) => Promise<IUser | null>;
    create: (payload: {
        email: string;
        passwordHash: string;
        role: 'ADMIN';
        subscriptionTier: 'PRO';
        isDeleted: false;
        isBanned: false;
    }) => Promise<unknown>;
    updateOne: (
        filter: { _id: IUser['_id'] },
        update: { $set: Partial<Pick<IUser, 'role' | 'isDeleted' | 'isBanned'>> },
    ) => Promise<unknown>;
};

type ProvisionDeps = {
    credentials?: {
        email: string;
        password: string;
    };
    userModel?: SeedUserModel;
    hashPassword?: (value: string, rounds: number) => Promise<string>;
    logger?: SeedLogger;
};

function isValidEmail(value: string): boolean {
    return EMAIL_REGEX.test(value);
}

export function validateDefaultAdminCredentials(
    emailRaw: string,
    passwordRaw: string,
): { email: string; password: string } {
    const email = emailRaw.trim().toLowerCase();
    const password = passwordRaw.trim();

    if (!isValidEmail(email)) {
        throw new Error('DEFAULT_ADMIN_EMAIL must be a valid email address.');
    }

    if (password.length < DEFAULT_ADMIN_PASSWORD_MIN_LENGTH) {
        throw new Error(
            `DEFAULT_ADMIN_PASSWORD must be at least ${DEFAULT_ADMIN_PASSWORD_MIN_LENGTH} characters long.`,
        );
    }

    return { email, password };
}

export async function provisionDefaultAdmin(deps: ProvisionDeps = {}): Promise<SeedOutcome> {
    const logger = deps.logger ?? console;
    const userModel: SeedUserModel = deps.userModel ?? User;
    const hashPassword = deps.hashPassword ?? bcrypt.hash;

    let email = '';
    let password = '';

    if (deps.credentials) {
        const validated = validateDefaultAdminCredentials(
            deps.credentials.email,
            deps.credentials.password,
        );
        email = validated.email;
        password = validated.password;
    } else {
        const emailRaw = ENV.DEFAULT_ADMIN_EMAIL;
        const passwordRaw = ENV.DEFAULT_ADMIN_PASSWORD;

        if (!emailRaw && !passwordRaw) {
            logger.warn(
                '[seed] DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD are not set. Skipping default admin provisioning.',
            );
            return 'skipped';
        }

        if (!emailRaw || !passwordRaw) {
            throw new Error(
                'Both DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set to provision the default admin.',
            );
        }

        const validated = validateDefaultAdminCredentials(emailRaw, passwordRaw);
        email = validated.email;
        password = validated.password;
    }

    const existing = await userModel.findOne({ email });

    if (!existing) {
        const passwordHash = await hashPassword(password, BCRYPT_ROUNDS);
        await userModel.create({
            email,
            passwordHash,
            role: 'ADMIN',
            subscriptionTier: 'PRO',
            isDeleted: false,
            isBanned: false,
        });
        logger.log(`[seed] Created default admin: ${email}`);
        return 'created';
    }

    const shouldUpdate =
        existing.role !== 'ADMIN' || existing.isDeleted === true || existing.isBanned === true;

    if (!shouldUpdate) {
        logger.log(`[seed] Default admin already exists: ${email}`);
        return 'exists';
    }

    await userModel.updateOne(
        { _id: existing._id },
        {
            $set: {
                role: 'ADMIN',
                isDeleted: false,
                isBanned: false,
            },
        },
    );
    logger.log(`[seed] Elevated/restored existing user to ADMIN: ${email}`);
    return 'updated';
}

export async function runSeed(argv: string[] = process.argv.slice(2)): Promise<void> {
    const isDryRun = argv.includes('--dry-run');

    const emailRaw = ENV.DEFAULT_ADMIN_EMAIL;
    const passwordRaw = ENV.DEFAULT_ADMIN_PASSWORD;

    if (!emailRaw && !passwordRaw) {
        console.warn(
            '[seed] No default admin credentials provided. Nothing to do (set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD).',
        );
        return;
    }

    if (!emailRaw || !passwordRaw) {
        throw new Error(
            'Both DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set to run the seed script.',
        );
    }

    validateDefaultAdminCredentials(emailRaw, passwordRaw);

    if (isDryRun) {
        console.log('[seed] Dry-run successful: default admin credentials are valid.');
        return;
    }

    await connectDatabase();
    try {
        await provisionDefaultAdmin();
    } finally {
        await disconnectDatabase();
    }
}

if (require.main === module) {
    runSeed().catch((error: unknown) => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(`[seed] Failed: ${message}`);
        process.exit(1);
    });
}
