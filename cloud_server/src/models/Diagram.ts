import { Schema, model, type Document, type Types } from 'mongoose';

// ── Types ─────────────────────────────────────────────────────────────────

/** Visual geometry stored in diagram layout. No binding data. */
export interface DiagramLayout {
    images?: unknown[];
    connectionPoints?: unknown[];
    connections?: unknown[];
    widgets?: unknown[];
    [key: string]: unknown;
}

export interface IDiagram extends Document {
    _id: Types.ObjectId;
    ownerId: Types.ObjectId;
    sourceTemplateId?: Types.ObjectId | null;
    quotaSlot?: 1 | 2 | 3 | null;
    name: string;
    layout: DiagramLayout;
    __v: number;
    createdAt: Date;
    updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────

const DiagramSchema = new Schema<IDiagram>(
    {
        ownerId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'ownerId is required'],
            index: true,
        },
        sourceTemplateId: {
            type: Schema.Types.ObjectId,
            ref: 'Diagram',
            required: false,
        },
        quotaSlot: {
            type: Number,
            enum: [1, 2, 3],
            required: false,
        },
        name: {
            type: String,
            required: [true, 'name is required'],
            trim: true,
        },
        layout: {
            type: Schema.Types.Mixed,
            required: [true, 'layout is required'],
            default: {},
        },
    },
    {
        // versionKey: true — Mongoose default; must stay enabled for OCC
        timestamps: true,
        // Keep empty layout objects in API payloads.
        minimize: false,
    },
);

DiagramSchema.index(
    { ownerId: 1, sourceTemplateId: 1 },
    {
        name: 'uniq_diagram_owner_source_template',
        unique: true,
        partialFilterExpression: { sourceTemplateId: { $type: 'objectId' } },
    },
);

DiagramSchema.index(
    { ownerId: 1, quotaSlot: 1 },
    {
        name: 'uniq_diagram_owner_quota_slot',
        unique: true,
        partialFilterExpression: { quotaSlot: { $type: 'number' } },
    },
);

// ── Model ─────────────────────────────────────────────────────────────────

export const Diagram = model<IDiagram>('Diagram', DiagramSchema);
