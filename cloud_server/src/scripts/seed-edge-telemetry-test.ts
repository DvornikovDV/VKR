import mongoose, { type Types } from 'mongoose';
import { createHmac } from 'node:crypto';
import { ENV } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../database/mongoose';
import { EdgeServer } from '../models/EdgeServer';
import { User } from '../models/User';
import { EdgeOnboardingService } from '../services/edge-onboarding.service';

const DEFAULT_EDGE_NAME = 'Local Telemetry Test Edge';

type SeedLogger = Pick<Console, 'log'>;
type SeedStatus = 'created' | 'reused';

export interface SeedEdgeTelemetryTestResult {
    edgeId: string;
    edgeName: string;
    credentialSecret: string;
    status: SeedStatus;
}

function parseTrustedUserId(argv: string[]): string | undefined {
    const flagIndex = argv.indexOf('--trusted-user-id');
    if (flagIndex < 0) return undefined;

    const value = argv[flagIndex + 1];
    if (!value || value.startsWith('--')) {
        throw new Error('Flag --trusted-user-id requires a value.');
    }

    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error('Flag --trusted-user-id requires a non-empty value.');
    }

    return trimmed;
}

async function resolveTrustedUserId(rawUserId: string | undefined): Promise<Types.ObjectId | null> {
    if (!rawUserId) {
        return null;
    }

    if (!mongoose.isValidObjectId(rawUserId)) {
        throw new Error(`Invalid trusted user id: ${rawUserId}`);
    }

    const user = await User.findById(rawUserId).select('_id').lean().exec();
    if (!user) {
        throw new Error(`Trusted user not found: ${rawUserId}`);
    }

    return user._id;
}

function mergeTrustedUsers(
    existingTrustedUsers: Types.ObjectId[],
    trustedUserId: Types.ObjectId | null,
): Types.ObjectId[] {
    if (!trustedUserId) {
        return existingTrustedUsers;
    }

    if (existingTrustedUsers.some((value) => value.equals(trustedUserId))) {
        return existingTrustedUsers;
    }

    return [...existingTrustedUsers, trustedUserId];
}

function derivePersistentSecret(edgeId: string): string {
    return createHmac('sha256', ENV.JWT_SECRET)
        .update(`edge-telemetry-test:${edgeId}`)
        .digest('base64url');
}

export async function seedEdgeTelemetryTest(
    argv: string[] = process.argv.slice(2),
    logger: SeedLogger = console,
): Promise<SeedEdgeTelemetryTestResult> {
    const trustedUserIdRaw = parseTrustedUserId(argv);

    await connectDatabase();
    try {
        const trustedUserId = await resolveTrustedUserId(trustedUserIdRaw);
        const existingEdges = await EdgeServer.find({ name: DEFAULT_EDGE_NAME }).limit(2).exec();

        if (existingEdges.length > 1) {
            throw new Error(
                `Multiple edge documents found for "${DEFAULT_EDGE_NAME}". ` +
                    'Refusing to guess which test edge should be reused.',
            );
        }

        const now = new Date();

        if (existingEdges.length === 0) {
            const edgeId = new mongoose.Types.ObjectId();
            const credentialSecret = derivePersistentSecret(edgeId.toString());
            const secretHash = await EdgeOnboardingService.hashCredentialSecret(credentialSecret);
            const createdEdge = await EdgeServer.create({
                _id: edgeId,
                name: DEFAULT_EDGE_NAME,
                trustedUsers: trustedUserId ? [trustedUserId] : [],
                createdBy: null,
                lifecycleState: 'Active',
                availability: { online: false, lastSeenAt: null },
                activation: {
                    firstActivatedAt: now,
                    lastActivatedAt: now,
                    lastRejectedAt: null,
                },
                currentOnboardingPackage: null,
                persistentCredential: {
                    version: 1,
                    secretHash,
                    issuedAt: now,
                    lastAcceptedAt: null,
                    revokedAt: null,
                    revocationReason: null,
                },
                lastLifecycleEventAt: now,
            });

            const result: SeedEdgeTelemetryTestResult = {
                edgeId: createdEdge._id.toString(),
                edgeName: createdEdge.name,
                credentialSecret,
                status: 'created',
            };

            logger.log(`[seed-edge-telemetry-test] status=${result.status}`);
            logger.log(`[seed-edge-telemetry-test] edgeId=${result.edgeId}`);
            logger.log(`[seed-edge-telemetry-test] edgeName=${result.edgeName}`);
            logger.log(`[seed-edge-telemetry-test] secret=${result.credentialSecret}`);
            return result;
        }

        const existingEdge = existingEdges[0];
        const credentialSecret = derivePersistentSecret(existingEdge._id.toString());
        const nextSecretHash = await EdgeOnboardingService.hashCredentialSecret(credentialSecret);
        const nextTrustedUsers = mergeTrustedUsers(
            [...existingEdge.trustedUsers],
            trustedUserId,
        );
        const persistentCredential = existingEdge.persistentCredential;
        const hasReusableCredential = Boolean(
            persistentCredential &&
                persistentCredential.revokedAt === null &&
                await EdgeOnboardingService.verifyCredentialSecret(
                    credentialSecret,
                    persistentCredential.secretHash,
                ),
        );
        const needsRepair =
            existingEdge.name !== DEFAULT_EDGE_NAME ||
            existingEdge.lifecycleState !== 'Active' ||
            existingEdge.currentOnboardingPackage !== null ||
            existingEdge.createdBy !== null ||
            nextTrustedUsers.length !== existingEdge.trustedUsers.length ||
            !hasReusableCredential;

        if (needsRepair) {
            existingEdge.name = DEFAULT_EDGE_NAME;
            existingEdge.trustedUsers = nextTrustedUsers;
            existingEdge.createdBy = null;
            existingEdge.lifecycleState = 'Active';
            existingEdge.availability = {
                online: false,
                lastSeenAt: existingEdge.availability?.lastSeenAt ?? null,
            };
            existingEdge.activation = {
                firstActivatedAt: existingEdge.activation?.firstActivatedAt ?? now,
                lastActivatedAt: existingEdge.activation?.lastActivatedAt ?? now,
                lastRejectedAt: existingEdge.activation?.lastRejectedAt ?? null,
            };
            existingEdge.currentOnboardingPackage = null;
            existingEdge.persistentCredential = {
                version: persistentCredential?.version ?? 1,
                secretHash: nextSecretHash,
                issuedAt: persistentCredential?.issuedAt ?? now,
                lastAcceptedAt: persistentCredential?.lastAcceptedAt ?? null,
                revokedAt: null,
                revocationReason: null,
            };
            existingEdge.lastLifecycleEventAt = existingEdge.lastLifecycleEventAt ?? now;
            await existingEdge.save();
        }

        const result: SeedEdgeTelemetryTestResult = {
            edgeId: existingEdge._id.toString(),
            edgeName: existingEdge.name,
            credentialSecret,
            status: 'reused',
        };

        logger.log(`[seed-edge-telemetry-test] status=${result.status}`);
        logger.log(`[seed-edge-telemetry-test] edgeId=${result.edgeId}`);
        logger.log(`[seed-edge-telemetry-test] edgeName=${result.edgeName}`);
        logger.log(`[seed-edge-telemetry-test] secret=${result.credentialSecret}`);
        return result;
    } finally {
        await disconnectDatabase();
    }
}

if (require.main === module) {
    seedEdgeTelemetryTest().catch((error: unknown) => {
        const message = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error(`[seed-edge-telemetry-test] Failed: ${message}`);
        process.exit(1);
    });
}
