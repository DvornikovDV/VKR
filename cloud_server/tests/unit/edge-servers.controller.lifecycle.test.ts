import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';

const {
    rotateEdgeCredentialMock,
    getAdminEdgeByIdMock,
    disconnectEdgeSocketsByIdMock,
} = vi.hoisted(() => ({
    rotateEdgeCredentialMock: vi.fn(),
    getAdminEdgeByIdMock: vi.fn(),
    disconnectEdgeSocketsByIdMock: vi.fn(),
}));

vi.mock('../../src/services/edge-servers.service', () => ({
    EdgeServersService: {
        rotateEdgeCredential: rotateEdgeCredentialMock,
        getAdminEdgeById: getAdminEdgeByIdMock,
    },
}));

vi.mock('../../src/socket/io', () => ({
    disconnectEdgeSocketsById: disconnectEdgeSocketsByIdMock,
}));

import { EdgeServersController } from '../../src/api/edge-servers.controller';

describe('edge-servers.controller lifecycle wiring', () => {
    beforeEach(() => {
        rotateEdgeCredentialMock.mockReset();
        getAdminEdgeByIdMock.mockReset();
        disconnectEdgeSocketsByIdMock.mockReset();
    });

    it('uses credential_rotated forced disconnect reason for rotate-credential', async () => {
        rotateEdgeCredentialMock.mockResolvedValue({
            edge: {
                _id: 'edge-1',
                name: 'Edge 1',
                trustedUsers: [],
                createdBy: { _id: 'admin-1' },
                lifecycleState: 'Active',
                availability: { online: false, lastSeenAt: null },
                persistentCredentialVersion: 2,
                lastLifecycleEventAt: '2026-04-13T00:00:00.000Z',
                createdAt: '2026-04-13T00:00:00.000Z',
            },
            persistentCredential: {
                edgeId: 'edge-1',
                credentialSecret: 'secret',
                version: 2,
                issuedAt: '2026-04-13T00:00:00.000Z',
                instructions:
                    'Use this secret as the edge runtime persistent credential for trusted connects and reconnects.',
            },
        });
        getAdminEdgeByIdMock.mockResolvedValue({
            _id: 'edge-1',
            name: 'Edge 1',
            trustedUsers: [],
            createdBy: { _id: 'admin-1' },
            lifecycleState: 'Active',
            availability: { online: false, lastSeenAt: null },
            persistentCredentialVersion: 2,
            lastLifecycleEventAt: '2026-04-13T00:00:00.000Z',
            createdAt: '2026-04-13T00:00:00.000Z',
        });

        const req = {
            params: { edgeId: 'edge-1' },
            user: { userId: 'admin-1', role: 'ADMIN' },
        } as never;

        const json = vi.fn();
        const status = vi.fn().mockReturnValue({ json });
        const res = { status } as unknown as Response;
        const next = vi.fn() as NextFunction;

        await EdgeServersController.rotateEdgeCredential(req, res, next);

        expect(rotateEdgeCredentialMock).toHaveBeenCalledWith('edge-1', 'admin-1');
        expect(getAdminEdgeByIdMock).toHaveBeenCalledWith('edge-1');
        expect(disconnectEdgeSocketsByIdMock).toHaveBeenCalledWith(
            'edge-1',
            'credential_rotated',
        );
        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith({
            status: 'success',
            data: expect.objectContaining({
                persistentCredential: expect.objectContaining({
                    edgeId: 'edge-1',
                    version: 2,
                }),
            }),
        });
        expect(next).not.toHaveBeenCalled();
    });
});
