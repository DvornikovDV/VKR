import { Schema, model, type Document, type Types } from 'mongoose';
import { DEVICE_ID_PATTERN, METRIC_PATTERN } from '../services/edge-identity.validation';

// ── Types ─────────────────────────────────────────────────────────────────

export interface IWidgetBinding {
    widgetId: string;
    deviceId: string;
    metric: string;
}

export type CommandType = 'set_bool' | 'set_number';

export interface ICommandBinding {
    widgetId: string;
    deviceId: string;
    commandType: CommandType;
}

export interface IDiagramBindings extends Document {
    _id: Types.ObjectId;
    diagramId: Types.ObjectId;
    ownerId: Types.ObjectId;
    edgeServerId: Types.ObjectId;
    widgetBindings: IWidgetBinding[];
    commandBindings: ICommandBinding[];
    createdAt: Date;
    updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────

const WidgetBindingSchema = new Schema<IWidgetBinding>(
    {
        widgetId: { type: String, required: true, trim: true, minlength: 1 },
        deviceId: { type: String, required: true, trim: true, match: DEVICE_ID_PATTERN },
        metric: { type: String, required: true, trim: true, match: METRIC_PATTERN },
    },
    { _id: false },
);

const COMMAND_TYPES: CommandType[] = ['set_bool', 'set_number'];

const CommandBindingSchema = new Schema<ICommandBinding>(
    {
        widgetId:    { type: String, required: true, trim: true, minlength: 1 },
        deviceId:    { type: String, required: true, trim: true, match: DEVICE_ID_PATTERN },
        commandType: { type: String, required: true, enum: COMMAND_TYPES },
    },
    { _id: false },
);

const DiagramBindingsSchema = new Schema<IDiagramBindings>(
    {
        diagramId: {
            type: Schema.Types.ObjectId,
            ref: 'Diagram',
            required: [true, 'diagramId is required'],
        },
        ownerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'ownerId is required'],
        },
        edgeServerId: {
            type: Schema.Types.ObjectId,
            ref: 'EdgeServer',
            required: [true, 'edgeServerId is required'],
        },
        widgetBindings: {
            type: [WidgetBindingSchema],
            required: true,
            default: [],
        },
        commandBindings: {
            type: [CommandBindingSchema],
            default: [],
        },
    },
    {
        timestamps: true,
        collection: 'diagram_bindings',
    },
);

// Compound unique index: one binding set per (diagramId, edgeServerId) pair
DiagramBindingsSchema.index({ diagramId: 1, edgeServerId: 1 }, { unique: true });

// ── Model ─────────────────────────────────────────────────────────────────

export const DiagramBindings = model<IDiagramBindings>('DiagramBindings', DiagramBindingsSchema);
