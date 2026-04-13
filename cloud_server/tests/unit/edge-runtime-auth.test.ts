import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    compareMock,
    findByIdMock,
    findOneAndUpdateMock,
} = vi.hoisted(() => ({
    compareMock: vi.fn(),
    findByIdMock: vi.fn(),
    findOneAndUpdateMock: vi.fn(),
}));

vi.mock('bcrypt', () => ({
    default: {
        compare: compareMock,
    },
}));

vi.mock('../../src/models/EdgeServer', () => ({
    EdgeServer: {
        findById: findByIdMock,
        findOneAndUpdate: findOneAndUpdateMock,
    },
}));

import { authenticatePersistentEdgeRuntime } from '../../src/socket/events/edge-runtime-auth';

type QueryLike<T> = {
    select: () => QueryLike<T>;
    lean: () => QueryLike<T>;
    exec: () => Promise<T>;
};

function queryResult<T>(value: T): QueryLike<T> {
    return {
        select: () => queryResult(value),
        lean: () => queryResult(value),
        exec: async () => value,
    };
}

describe('edge-runtime-auth', () => {
    beforeEach(() => {
        compareMock.mockReset();
        findByIdMock.mockReset();
        findOneAndUpdateMock.mockReset();
    });

    it('rejects the connect if credential state changed before trusted session finalization', async () => {
        const edgeId = '69d000000000000000000001';
        findByIdMock.mockReturnValueOnce(
            queryResult({
                _id: { toString: () => edgeId },
                lifecycleState: 'Active',
                persistentCredential: {
                    version: 2,
                    secretHash: 'hash-v2',
                },
            }),
        );
        compareMock.mockResolvedValueOnce(true);
        findOneAndUpdateMock.mockReturnValueOnce(queryResult(null));
        findByIdMock.mockReturnValueOnce(
            queryResult({
                _id: { toString: () => edgeId },
                lifecycleState: 'Active',
                persistentCredential: {
                    version: 3,
                    secretHash: 'hash-v3',
                },
            }),
        );

        const result = await authenticatePersistentEdgeRuntime({
            handshake: {
                auth: {
                    edgeId,
                    credentialSecret: 'secret-v2',
                },
            },
        });

        expect(result).toEqual({
            ok: false,
            code: 'invalid_credential',
        });
    });

    it('rejects the connect as blocked if lifecycle changed before trusted session finalization', async () => {
        const edgeId = '69d000000000000000000002';
        findByIdMock.mockReturnValueOnce(
            queryResult({
                _id: { toString: () => edgeId },
                lifecycleState: 'Active',
                persistentCredential: {
                    version: 1,
                    secretHash: 'hash-v1',
                },
            }),
        );
        compareMock.mockResolvedValueOnce(true);
        findOneAndUpdateMock.mockReturnValueOnce(queryResult(null));
        findByIdMock.mockReturnValueOnce(
            queryResult({
                _id: { toString: () => edgeId },
                lifecycleState: 'Blocked',
                persistentCredential: {
                    version: 1,
                    secretHash: 'hash-v1',
                },
            }),
        );

        const result = await authenticatePersistentEdgeRuntime({
            handshake: {
                auth: {
                    edgeId,
                    credentialSecret: 'secret-v1',
                },
            },
        });

        expect(result).toEqual({
            ok: false,
            code: 'blocked',
        });
    });
});
