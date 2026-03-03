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
    },
);

// ── Model ─────────────────────────────────────────────────────────────────

export const Diagram = model<IDiagram>('Diagram', DiagramSchema);
