import { Schema, model, type Document, type Types } from 'mongoose';

// ── Types ─────────────────────────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'USER';
export type SubscriptionTier = 'FREE' | 'PRO';

export interface IUser extends Document {
    _id: Types.ObjectId;
    email: string;
    passwordHash: string;
    role: UserRole;
    subscriptionTier: SubscriptionTier;
    isDeleted: boolean;
    isBanned: boolean;
    createdAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────

const UserSchema = new Schema<IUser>(
    {
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Invalid email format'],
        },
        passwordHash: {
            type: String,
            required: [true, 'Password hash is required'],
        },
        role: {
            type: String,
            enum: { values: ['ADMIN', 'USER'] as const, message: 'Invalid role' },
            default: 'USER',
            required: true,
        },
        subscriptionTier: {
            type: String,
            enum: { values: ['FREE', 'PRO'] as const, message: 'Invalid subscription tier' },
            default: 'FREE',
            required: true,
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        isBanned: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
    },
);

// Strip passwordHash from JSON serialization
UserSchema.set('toJSON', {
    transform: (_doc, ret) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (ret as any)['passwordHash'];
        return ret;
    },
});

// ── Model ─────────────────────────────────────────────────────────────────

export const User = model<IUser>('User', UserSchema);
