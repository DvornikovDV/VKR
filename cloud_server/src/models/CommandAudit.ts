import { Schema, model, type Document, type Types } from 'mongoose';

import { COMMAND_TYPES, type CommandFailureReason, type CommandRequest, type CommandRpcStatus, type CommandType } from '../types';

export const COMMAND_AUDIT_STATUSES = [
    'accepted',
    'sent_to_edge',
    'confirmed',
    'timeout',
    'failed',
] as const satisfies readonly CommandRpcStatus[];

export const COMMAND_AUDIT_FAILURE_REASONS = [
    'cloud_rpc_timeout',
    'edge_command_timeout',
    'edge_unavailable',
    'edge_command_failed',
] as const satisfies readonly CommandFailureReason[];

export const COMMAND_AUDIT_RETENTION_SECONDS = 30 * 24 * 60 * 60;

export interface ICommandAudit extends Document {
    _id: Types.ObjectId;
    requestId: string;
    edgeId: Types.ObjectId;
    deviceId: string;
    commandType: CommandType;
    payload: CommandRequest['payload'];
    requestedBy: Types.ObjectId;
    requestedAt: Date;
    status: CommandRpcStatus;
    completedAt: Date | null;
    failureReason: CommandFailureReason | null;
}

const CommandAuditSchema = new Schema<ICommandAudit>(
    {
        requestId: {
            type: String,
            required: true,
            trim: true,
        },
        edgeId: {
            type: Schema.Types.ObjectId,
            ref: 'EdgeServer',
            required: true,
        },
        deviceId: {
            type: String,
            required: true,
            trim: true,
        },
        commandType: {
            type: String,
            enum: COMMAND_TYPES,
            required: true,
        },
        payload: {
            type: Schema.Types.Mixed,
            required: true,
        },
        requestedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        requestedAt: {
            type: Date,
            default: Date.now,
            required: true,
        },
        status: {
            type: String,
            enum: COMMAND_AUDIT_STATUSES,
            default: 'accepted',
            required: true,
        },
        completedAt: {
            type: Date,
            default: null,
        },
        failureReason: {
            type: String,
            enum: COMMAND_AUDIT_FAILURE_REASONS,
            default: null,
        },
    },
    {
        versionKey: false,
        strict: true,
    },
);

CommandAuditSchema.index({ requestId: 1 }, { unique: true });
CommandAuditSchema.index({ requestedAt: 1 }, { expireAfterSeconds: COMMAND_AUDIT_RETENTION_SECONDS });

export const CommandAudit = model<ICommandAudit>('CommandAudit', CommandAuditSchema);
