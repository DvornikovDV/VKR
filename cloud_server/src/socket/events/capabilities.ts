import { type Socket } from 'socket.io';

import { EdgeServersService } from '../../services/edge-servers.service';
import { isTrustedEdgeSocket } from './edge-runtime-session';

export const EDGE_CAPABILITIES_CATALOG_EVENT = 'capabilities_catalog';

function readPayloadEdgeId(payload: unknown): string | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }

    const edgeServerId = (payload as Record<string, unknown>)['edgeServerId'];
    return typeof edgeServerId === 'string' && edgeServerId.trim().length > 0
        ? edgeServerId.trim()
        : null;
}

export function registerCapabilitiesCatalogHandler(socket: Socket, edgeId: string): void {
    socket.on(EDGE_CAPABILITIES_CATALOG_EVENT, (payload: unknown) => {
        if (!isTrustedEdgeSocket(socket, edgeId)) {
            console.warn(`[capabilities] Ignored catalog from untrusted edge session ${edgeId}`);
            return;
        }

        if (readPayloadEdgeId(payload) !== edgeId) {
            console.warn(`[capabilities] Ignored catalog with mismatched edgeServerId for edge ${edgeId}`);
            return;
        }

        void EdgeServersService.storeLatestCapabilitiesCatalog(edgeId, payload).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[capabilities] Ignored invalid catalog from edge ${edgeId}: ${message}`);
        });
    });
}
