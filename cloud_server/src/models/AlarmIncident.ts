import { Schema, model, type Document, type Types } from 'mongoose';

import {
    ALARM_CONDITION_TYPES,
    ALARM_SEVERITIES,
    type AlarmConditionType,
    type AlarmExpectedValue,
    type AlarmObservedValue,
    type AlarmSeverity,
} from '../types';

export interface IAlarmRuleSnapshot {
    ruleId: string;
    ruleRevision: string;
    conditionType: AlarmConditionType;
    triggerThreshold: number | null;
    clearThreshold: number | null;
    expectedValue: AlarmExpectedValue;
    severity: AlarmSeverity;
    label: string;
}

export interface IAlarmIncident extends Document {
    _id: Types.ObjectId;
    edgeId: Types.ObjectId;
    sourceId: string;
    deviceId: string;
    metric: string;
    ruleId: string;
    latestValue: AlarmObservedValue;
    latestTs: number;
    latestDetectedAt: number;
    rule: IAlarmRuleSnapshot;
    isActive: boolean;
    isAcknowledged: boolean;
    activatedAt: Date;
    clearedAt: Date | null;
    acknowledgedAt: Date | null;
    acknowledgedBy: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}

function isAlarmObservedValue(value: unknown): value is AlarmObservedValue {
    return typeof value === 'number' || typeof value === 'boolean';
}

function isAlarmExpectedValue(value: unknown): value is AlarmExpectedValue {
    return value === null || isAlarmObservedValue(value);
}

function matchesRuleSnapshot(this: IAlarmIncident, value: string): boolean {
    return !this.rule?.ruleId || value === this.rule.ruleId;
}

const AlarmRuleSnapshotSchema = new Schema<IAlarmRuleSnapshot>(
    {
        ruleId: {
            type: String,
            required: true,
            trim: true,
        },
        ruleRevision: {
            type: String,
            required: true,
            trim: true,
        },
        conditionType: {
            type: String,
            enum: ALARM_CONDITION_TYPES,
            required: true,
        },
        triggerThreshold: {
            type: Number,
            default: null,
        },
        clearThreshold: {
            type: Number,
            default: null,
        },
        expectedValue: {
            type: Schema.Types.Mixed,
            default: null,
            validate: {
                validator: isAlarmExpectedValue,
                message: 'expectedValue must be a number, boolean, or null',
            },
        },
        severity: {
            type: String,
            enum: ALARM_SEVERITIES,
            required: true,
        },
        label: {
            type: String,
            required: true,
            trim: true,
        },
    },
    {
        _id: false,
        strict: true,
    },
);

const AlarmIncidentSchema = new Schema<IAlarmIncident>(
    {
        edgeId: {
            type: Schema.Types.ObjectId,
            ref: 'EdgeServer',
            required: true,
        },
        sourceId: {
            type: String,
            required: true,
            trim: true,
        },
        deviceId: {
            type: String,
            required: true,
            trim: true,
        },
        metric: {
            type: String,
            required: true,
            trim: true,
        },
        ruleId: {
            type: String,
            required: true,
            trim: true,
            validate: {
                validator: matchesRuleSnapshot,
                message: 'ruleId must match rule.ruleId',
            },
        },
        latestValue: {
            type: Schema.Types.Mixed,
            required: true,
            validate: {
                validator: isAlarmObservedValue,
                message: 'latestValue must be a number or boolean',
            },
        },
        latestTs: {
            type: Number,
            required: true,
        },
        latestDetectedAt: {
            type: Number,
            required: true,
        },
        rule: {
            type: AlarmRuleSnapshotSchema,
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            required: true,
        },
        isAcknowledged: {
            type: Boolean,
            default: false,
            required: true,
        },
        activatedAt: {
            type: Date,
            required: true,
        },
        clearedAt: {
            type: Date,
            default: null,
        },
        acknowledgedAt: {
            type: Date,
            default: null,
        },
        acknowledgedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
        strict: true,
    },
);

AlarmIncidentSchema.index(
    {
        edgeId: 1,
        ruleId: 1,
        deviceId: 1,
        metric: 1,
        isActive: 1,
        isAcknowledged: 1,
        activatedAt: -1,
    },
    { name: 'alarm_incident_reusable_lookup' },
);

AlarmIncidentSchema.index(
    {
        edgeId: 1,
        ruleId: 1,
        deviceId: 1,
        metric: 1,
    },
    {
        name: 'alarm_incident_unique_active_identity',
        unique: true,
        partialFilterExpression: { isActive: true },
    },
);

AlarmIncidentSchema.index(
    {
        edgeId: 1,
        activatedAt: -1,
        'rule.severity': 1,
        isActive: 1,
        isAcknowledged: 1,
    },
    { name: 'alarm_incident_journal_filters' },
);

export const AlarmIncident = model<IAlarmIncident>('AlarmIncident', AlarmIncidentSchema);
