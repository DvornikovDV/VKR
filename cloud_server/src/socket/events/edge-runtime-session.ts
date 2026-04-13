import { type Socket } from 'socket.io';

export type AuthenticatedEdgeContext = {
    edgeId: string;
    lifecycleState: 'Active';
    credentialVersion: number;
};

export function attachAuthenticatedEdgeContext(
    socket: Socket,
    context: AuthenticatedEdgeContext,
): void {
    socket.data['edgeId'] = context.edgeId;
    socket.data['lifecycleState'] = context.lifecycleState;
    socket.data['credentialVersion'] = context.credentialVersion;
    socket.data['trustedEdgeSession'] = true;
    socket.data['skipOfflineTransition'] = false;
}

export function markTrustedSessionLost(
    socket: Socket,
    options?: { skipOfflineTransition?: boolean },
): void {
    socket.data['trustedEdgeSession'] = false;
    if (options?.skipOfflineTransition) {
        socket.data['skipOfflineTransition'] = true;
    }
}

export function isTrustedEdgeSocket(socket: Socket, edgeId: string): boolean {
    return socket.connected === true &&
        socket.data['trustedEdgeSession'] === true &&
        socket.data['edgeId'] === edgeId;
}

export function shouldSkipOfflineTransition(socket: Socket): boolean {
    return socket.data['skipOfflineTransition'] === true;
}
