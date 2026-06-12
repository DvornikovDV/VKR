import { Schema, model, type Document } from 'mongoose';

export interface IMutationLease extends Document<string> {
    _id: string;
    resourceKey: string;
    token: string;
    expiresAt: Date;
}

const MutationLeaseSchema = new Schema<IMutationLease>(
    {
        _id: {
            type: String,
            required: true,
        },
        resourceKey: {
            type: String,
            required: true,
        },
        token: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    {
        versionKey: false,
        timestamps: false,
    },
);

MutationLeaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const MutationLease = model<IMutationLease>('MutationLease', MutationLeaseSchema);
