import { AppError } from '../api/middlewares/error.middleware';
import type { CommandRequest, CommandType } from '../types';
import { COMMAND_TYPES } from '../types';
import { normalizeDeviceId } from './edge-identity.validation';

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readPayloadValue(payload: unknown): unknown {
    if (!isRecord(payload)) {
        throw new AppError('payload.value is required', 400);
    }

    return payload['value'];
}

function readCommandType(value: unknown): CommandType {
    if (typeof value === 'string' && COMMAND_TYPES.includes(value as CommandType)) {
        return value as CommandType;
    }

    throw new AppError("commandType must be 'set_bool' or 'set_number'", 400);
}

export function validateCommandRequestBody(body: unknown): CommandRequest {
    if (!isRecord(body)) {
        throw new AppError('Command request body is required', 400);
    }

    const deviceId = normalizeDeviceId(body['deviceId']);
    if (!deviceId) {
        throw new AppError('deviceId must match [A-Za-z0-9._-]+', 400);
    }

    const commandType = readCommandType(body['commandType']);
    const value = readPayloadValue(body['payload']);

    if (commandType === 'set_bool') {
        if (typeof value !== 'boolean') {
            throw new AppError('payload.value must be a boolean for set_bool', 400);
        }

        return {
            deviceId,
            commandType,
            payload: { value },
        };
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AppError('payload.value must be a finite number for set_number', 400);
    }

    return {
        deviceId,
        commandType,
        payload: { value },
    };
}
