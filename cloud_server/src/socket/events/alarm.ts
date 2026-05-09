import { type Server as IOServer, type Socket } from 'socket.io';

import {
    persistActiveAlarmIncident,
    persistClearAlarmIncident,
    projectAlarmIncident,
} from '../../services/alarm-incidents.service';
import { validateAlarmEventPayload } from '../../services/alarm-events.validation';
import {
    ALARM_EDGE_EVENT_NAME,
    ALARM_INCIDENT_CHANGED_EVENT_NAME,
    type AlarmIncidentChangedEventDto,
    type AlarmIncidentProjectionDto,
} from '../../types';
import { isTrustedEdgeSocket } from './edge-runtime-session';

export function emitAlarmIncidentChanged(
    io: Pick<IOServer, 'to'>,
    edgeId: string,
    incident: AlarmIncidentProjectionDto,
): void {
    const payload: AlarmIncidentChangedEventDto = {
        edgeId,
        incident,
    };

    io.to(edgeId).emit(ALARM_INCIDENT_CHANGED_EVENT_NAME, payload);
}

export function registerAlarmEventHandler(
    socket: Socket,
    io: Pick<IOServer, 'to'>,
    edgeId: string,
): void {
    socket.on(ALARM_EDGE_EVENT_NAME, (payload: unknown) => {
        if (!isTrustedEdgeSocket(socket, edgeId)) {
            console.warn(`[alarm] Ignored alarm_event from untrusted edge session ${edgeId}`);
            return;
        }

        const event = validateAlarmEventPayload(edgeId, payload);
        if (!event) {
            console.warn(`[alarm] Ignored invalid alarm_event from edge ${edgeId}`);
            return;
        }

        const persist = event.eventType === 'active'
            ? persistActiveAlarmIncident
            : persistClearAlarmIncident;

        void persist(event)
            .then((incident) => {
                if (!incident) {
                    return;
                }

                emitAlarmIncidentChanged(io, edgeId, projectAlarmIncident(incident));
            })
            .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[alarm] Failed to handle alarm_event from edge ${edgeId}: ${message}`);
            });
    });
}
