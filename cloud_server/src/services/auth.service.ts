import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { User, type IUser } from '../models/User';
import { ENV } from '../config/env';
import { AppError } from '../api/middlewares/error.middleware';

// ── Constants ─────────────────────────────────────────────────────────────

const SALT_ROUNDS = 12;
const PASSWORD_MIN_LENGTH = 8;

// ── Types ─────────────────────────────────────────────────────────────────

/**
 * JWT payload embedded at token generation time.
 *
 * ⚠️  STALE-TIER WINDOW: `subscriptionTier` is embedded at login and cannot
 * be refreshed mid-session. An Admin can change a user's subscriptionTier via
 * the admin API (future phase), but the change only takes effect after the user
 * re-authenticates (i.e., when the old JWT expires and a new one is issued).
 *
 * Mitigation: keep `JWT_EXPIRES_IN` short (recommended ≤ 1h for production).
 * The current default is `JWT_EXPIRES_IN` from env (see config/env.ts).
 */
export interface AuthTokenPayload {
    userId: string;
    email: string;
    role: string;
    /**
     * Subscription tier at the time of login.
     * Modified only by Admin — stale until token expiry (see note above).
     */
    subscriptionTier: string;
}

export interface AuthResult {
    token: string;
    user: Pick<IUser, '_id' | 'email' | 'role' | 'subscriptionTier'>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Signs a JWT with the user's current role and subscriptionTier.
 * Tier is snapshot at the moment of login — see AuthTokenPayload for stale-tier notes.
 */
function generateToken(user: IUser): string {
    const payload: AuthTokenPayload = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
    };
    const options: SignOptions = { expiresIn: ENV.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
    return jwt.sign(payload, ENV.JWT_SECRET, options);
}

// ── Service methods ───────────────────────────────────────────────────────

/**
 * Registers a new user.
 * Throws 409 if email is already taken.
 * Throws 400 if password is too short.
 */
async function register(email: string, password: string): Promise<AuthResult> {
    if (password.length < PASSWORD_MIN_LENGTH) {
        throw new AppError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`, 400);
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
        throw new AppError('Email already registered', 409);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ email: email.toLowerCase(), passwordHash });

    return { token: generateToken(user), user };
}

/**
 * Authenticates a user by email and password.
 * Returns 401 for both unknown email and wrong password
 * (avoids email enumeration).
 */
async function login(email: string, password: string): Promise<AuthResult> {
    const user = await User.findOne({
        email: email.toLowerCase(),
        isDeleted: { $ne: true },
    });

    if (!user) {
        throw new AppError('Invalid credentials', 401);
    }

    // Reject banned users — no new token issued (FR-...)
    if (user.isBanned) {
        throw new AppError('Account has been suspended', 401);
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
        throw new AppError('Invalid credentials', 401);
    }

    return { token: generateToken(user), user };
}

// ── Export ────────────────────────────────────────────────────────────────

export const AuthService = { register, login };
