import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { EdgeServer } from '../../models/EdgeServer';
import type { AuthenticatedEdgeContext } from './edge-runtime-session';

type EdgeAuthFailureCode =
    | 'edge_not_found'
    | 'blocked'
    | 'invalid_credential';

type EdgeAuthSuccess = {
    ok: true;
    context: AuthenticatedEdgeContext;
};

type EdgeAuthFailure = {
    ok: false;
    code: EdgeAuthFailureCode;
};

type EdgeHandshakeDocument = {
    _id: mongoose.Types.ObjectId;
    lifecycleState: 'Active' | 'Blocked';
    persistentCredential: {
        version: number;
        secretHash: string;
    } | null;
};

function loadEdgeHandshakeDocument(edgeId: string) {
    return EdgeServer.findById(edgeId)
        .select('lifecycleState persistentCredential')
        .lean<EdgeHandshakeDocument | null>();
}

async function resolveFinalAuthFailure(edgeId: string): Promise<EdgeAuthFailure> {
    const currentEdge = await loadEdgeHandshakeDocument(edgeId).exec();
    if (!currentEdge) {
        return { ok: false, code: 'edge_not_found' };
    }

    if (currentEdge.lifecycleState === 'Blocked') {
        return { ok: false, code: 'blocked' };
    }

    return { ok: false, code: 'invalid_credential' };
}

function normalizeEdgeHandshakePayload(
    socket: { handshake: { auth?: Record<string, unknown> } },
): { edgeId: string; credentialSecret: string } | null {
    const auth = socket.handshake.auth;
    const edgeId = typeof auth?.['edgeId'] === 'string' ? auth['edgeId'].trim() : '';
    const credentialSecret =
        typeof auth?.['credentialSecret'] === 'string' ? auth['credentialSecret'].trim() : '';

    if (!edgeId || !credentialSecret) {
        return null;
    }

    // Do not keep backward compatibility with the legacy onboarding auth shape.
    if (Object.prototype.hasOwnProperty.call(auth ?? {}, 'credentialMode')) {
        return null;
    }

    return {
        edgeId,
        credentialSecret,
    };
}

export async function authenticatePersistentEdgeRuntime(
    socket: { handshake: { auth?: Record<string, unknown> } },
): Promise<EdgeAuthSuccess | EdgeAuthFailure> {
    const payload = normalizeEdgeHandshakePayload(socket);
    if (!payload) {
        return { ok: false, code: 'invalid_credential' };
    }

    if (!mongoose.isValidObjectId(payload.edgeId)) {
        return { ok: false, code: 'edge_not_found' };
    }

    const edge = await loadEdgeHandshakeDocument(payload.edgeId).exec();

    if (!edge) {
        return { ok: false, code: 'edge_not_found' };
    }

    if (edge.lifecycleState === 'Blocked') {
        return { ok: false, code: 'blocked' };
    }

    const persistentCredential = edge.persistentCredential;
    if (!persistentCredential?.secretHash) {
        return { ok: false, code: 'invalid_credential' };
    }

    const valid = await bcrypt.compare(payload.credentialSecret, persistentCredential.secretHash);
    if (!valid) {
        return { ok: false, code: 'invalid_credential' };
    }

    const finalizedEdge = await EdgeServer.findOneAndUpdate(
        {
            _id: edge._id,
            lifecycleState: 'Active',
            'persistentCredential.version': persistentCredential.version,
            'persistentCredential.secretHash': persistentCredential.secretHash,
        },
        {
            $set: {
                'persistentCredential.lastAcceptedAt': new Date(),
            },
        },
        {
            new: true,
        },
    )
        .select('persistentCredential')
        .lean<{ persistentCredential: { version: number } | null } | null>()
        .exec();

    if (!finalizedEdge?.persistentCredential) {
        return await resolveFinalAuthFailure(edge._id.toString());
    }

    return {
        ok: true,
        context: {
            edgeId: edge._id.toString(),
            lifecycleState: 'Active',
            credentialVersion: finalizedEdge.persistentCredential.version,
        },
    };
}
