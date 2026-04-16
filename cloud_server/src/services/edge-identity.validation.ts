export const DEVICE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
export const METRIC_PATTERN = /^[A-Za-z0-9._:/%-]+$/;

function normalizeIdentitySegment(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
        return null;
    }

    return normalized;
}

export function normalizeDeviceId(value: unknown): string | null {
    const normalized = normalizeIdentitySegment(value);
    if (!normalized || !DEVICE_ID_PATTERN.test(normalized)) {
        return null;
    }

    return normalized;
}

export function normalizeMetric(value: unknown): string | null {
    const normalized = normalizeIdentitySegment(value);
    if (!normalized || !METRIC_PATTERN.test(normalized)) {
        return null;
    }

    return normalized;
}

export function isDeviceIdValid(value: unknown): boolean {
    return normalizeDeviceId(value) !== null;
}

export function isMetricValid(value: unknown): boolean {
    return normalizeMetric(value) !== null;
}
