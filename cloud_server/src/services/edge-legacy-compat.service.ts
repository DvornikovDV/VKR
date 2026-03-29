import type { EdgeLifecycleState } from '../models/EdgeServer';

type SecretHashContainer = {
    secretHash?: string | null;
} | null | undefined;

export interface EdgeLegacyCompatibilityInput {
    lifecycleState: EdgeLifecycleState;
    availabilityLastSeenAt?: Date | null;
    lastSeen?: Date | null;
    apiKeyHash: string;
    currentOnboardingPackage?: SecretHashContainer;
    persistentCredential?: SecretHashContainer;
}

function asNullableDate(value: Date | null | undefined): Date | null {
    return value instanceof Date ? value : null;
}

function asNonEmptySecretHash(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

export function isEdgeLifecycleTelemetryReady(lifecycleState: EdgeLifecycleState): boolean {
    return lifecycleState === 'Active';
}

export function isLegacyEdgeActive(lifecycleState: EdgeLifecycleState): boolean {
    return lifecycleState !== 'Blocked';
}

export function resolveLegacyLastSeenTimestamp(input: {
    availabilityLastSeenAt?: Date | null;
    lastSeen?: Date | null;
}): Date | null {
    return asNullableDate(input.availabilityLastSeenAt) ?? asNullableDate(input.lastSeen);
}

export function resolveLegacyApiKeyHash(input: EdgeLegacyCompatibilityInput): string {
    const onboardingSecretHash = asNonEmptySecretHash(input.currentOnboardingPackage?.secretHash);
    const persistentSecretHash = asNonEmptySecretHash(input.persistentCredential?.secretHash);

    if (input.lifecycleState === 'Active') {
        return persistentSecretHash ?? onboardingSecretHash ?? input.apiKeyHash;
    }

    if (
        input.lifecycleState === 'Pending First Connection' ||
        input.lifecycleState === 'Re-onboarding Required'
    ) {
        return onboardingSecretHash ?? persistentSecretHash ?? input.apiKeyHash;
    }

    return persistentSecretHash ?? onboardingSecretHash ?? input.apiKeyHash;
}

