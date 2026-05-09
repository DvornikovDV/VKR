import { type Server as IOServer } from 'socket.io';

import {
    ALARM_INCIDENT_CHANGED_EVENT_NAME,
    type AlarmIncidentChangedEventDto,
    type AlarmIncidentProjectionDto,
} from '../../types';

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
