import { type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { type AuthTokenPayload } from '../services/auth.service';

// ── Augmented Socket data ─────────────────────────────────────────────────

/**
 * Attached to `socket.data` after successful JWT authentication.
 * Carries the minimal identity info needed by downstream event handlers.
 */
export interface AuthenticatedSocketData {
    userId: string;
    role: string;
    subscriptionTier: string;
}

// ── Types ─────────────────────────────────────────────────────────────────

/** Extended type for authenticated dashboard sockets. */
export interface AuthenticatedSocket extends Socket {
    data: AuthenticatedSocketData;
}

// ── Middleware ────────────────────────────────────────────────────────────

/**
 * Socket.IO middleware that validates the Bearer JWT sent in the
 * `auth.token` field of the handshake.
 *
 * Usage:
 *   io.of('/dashboard').use(jwtSocketMiddleware);
 *
 * Client-side:
 *   io({ auth: { token: 'Bearer eyJ...' } })
 *
 * On success:  populates `socket.data` with AuthenticatedSocketData and calls next().
 * On failure:  calls next(Error) causing Socket.IO to reject the connection.
 */
export function jwtSocketMiddleware(socket: Socket, next: (err?: Error) => void): void {
    const raw: unknown = socket.handshake.auth?.['token'];

    if (typeof raw !== 'string' || !raw.startsWith('Bearer ')) {
        next(new Error('Authentication error: JWT token missing or malformed'));
        return;
    }

    const token = raw.slice(7).trim();
    if (!token) {
        next(new Error('Authentication error: Bearer token is empty'));
        return;
    }

    try {
        const payload = jwt.verify(token, ENV.JWT_SECRET) as AuthTokenPayload;

        // ADMIN is a service role — dashboard access is for USER clients only
        if (payload.role !== 'USER') {
            next(new Error('Authentication error: dashboard access is restricted to USER role'));
            return;
        }

        socket.data = {
            userId: payload.userId,
            role: payload.role,
            subscriptionTier: payload.subscriptionTier,
        } satisfies AuthenticatedSocketData;
        next();
    } catch {
        next(new Error('Authentication error: invalid or expired JWT'));
    }
}
