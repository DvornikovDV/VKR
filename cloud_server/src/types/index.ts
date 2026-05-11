export interface EdgeAvailabilityRecord {
    online: boolean;
    lastSeenAt: string | null;
}

export interface EdgeStatusRecord {
    lifecycleState: 'Active' | 'Blocked';
    availability: EdgeAvailabilityRecord;
}

export interface EdgeServerUserRef {
    _id: string;
    email?: string;
    role?: 'ADMIN' | 'USER';
    subscriptionTier?: 'FREE' | 'PRO';
}

export interface EdgeServerCreatedByRef {
    _id: string;
    email?: string;
}

export interface EdgePersistentCredentialDisclosure {
    edgeId: string;
    credentialSecret: string;
    version: number;
    issuedAt: string;
    instructions: string;
}

export interface AdminEdgeServerRecord {
    _id: string;
    name: string;
    trustedUsers: Array<string | EdgeServerUserRef>;
    createdBy: EdgeServerCreatedByRef | null;
    lifecycleState: 'Active' | 'Blocked';
    availability: EdgeAvailabilityRecord;
    persistentCredentialVersion: number | null;
    lastLifecycleEventAt: string | null;
    createdAt: string;
}

export interface UserEdgeServerRecord {
    _id: string;
    name: string;
    lifecycleState: 'Active' | 'Blocked';
    availability: EdgeAvailabilityRecord;
    createdAt: string;
}

export interface EdgeCredentialIssueData {
    edge: AdminEdgeServerRecord;
    persistentCredential: EdgePersistentCredentialDisclosure;
}

export const COMMAND_TYPES = ['set_bool', 'set_number'] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

export type CommandRpcStatus = 'accepted' | 'sent_to_edge' | 'confirmed' | 'timeout' | 'failed';

export type CommandTerminalStatus = Extract<CommandRpcStatus, 'confirmed' | 'timeout' | 'failed'>;

export type CommandFailureReason =
    | 'cloud_rpc_timeout'
    | 'edge_command_timeout'
    | 'edge_unavailable'
    | 'edge_command_failed';

export interface SetBoolCommandRequest {
    deviceId: string;
    commandType: 'set_bool';
    payload: {
        value: boolean;
    };
}

export interface SetNumberCommandRequest {
    deviceId: string;
    commandType: 'set_number';
    payload: {
        value: number;
    };
}

export type CommandRequest = SetBoolCommandRequest | SetNumberCommandRequest;

export type CommandRpcRequest = CommandRequest & {
    edgeId: string;
    requestedBy: string;
};

export interface CommandResult {
    requestId: string;
    status: CommandTerminalStatus;
    failureReason?: CommandFailureReason;
    completedAt: string;
}

export type CommandAuditProjection = CommandRpcRequest & {
    requestId: string;
    status: CommandRpcStatus;
    requestedAt: string;
    completedAt: string | null;
    failureReason: CommandFailureReason | null;
};

export const ALARM_EDGE_EVENT_NAME = 'alarm_event' as const;
export const ALARM_INCIDENT_CHANGED_EVENT_NAME = 'alarm_incident_changed' as const;

export const ALARM_SOCKET_EVENTS = {
    edgeAlarmEvent: ALARM_EDGE_EVENT_NAME,
    incidentChanged: ALARM_INCIDENT_CHANGED_EVENT_NAME,
} as const;

export const ALARM_EVENT_TYPES = ['active', 'clear'] as const;

export type AlarmEventType = (typeof ALARM_EVENT_TYPES)[number];

export const ALARM_CONDITION_TYPES = ['high', 'low', 'state', 'connectivity'] as const;

export type AlarmConditionType = (typeof ALARM_CONDITION_TYPES)[number];

export const ALARM_SEVERITIES = ['warning', 'danger'] as const;

export type AlarmSeverity = (typeof ALARM_SEVERITIES)[number];

export type AlarmObservedValue = number | boolean;

export type AlarmExpectedValue = AlarmObservedValue | null;

export interface AlarmIncidentLifecycleFlags {
    isActive: boolean;
    isAcknowledged: boolean;
}

export const ALARM_INCIDENT_LIFECYCLE = {
    activeUnacknowledged: {
        isActive: true,
        isAcknowledged: false,
    },
    activeAcknowledged: {
        isActive: true,
        isAcknowledged: true,
    },
    clearedUnacknowledged: {
        isActive: false,
        isAcknowledged: false,
    },
    closed: {
        isActive: false,
        isAcknowledged: true,
    },
} as const satisfies Record<string, AlarmIncidentLifecycleFlags>;

export const ALARM_INCIDENT_LIFECYCLE_STATES = [
    'active_unacknowledged',
    'active_acknowledged',
    'cleared_unacknowledged',
    'closed',
] as const;

export type AlarmIncidentLifecycleState = (typeof ALARM_INCIDENT_LIFECYCLE_STATES)[number];

export interface AlarmRuleSnapshotDto {
    ruleId: string;
    ruleRevision: string;
    conditionType: AlarmConditionType;
    triggerThreshold: number | null;
    clearThreshold: number | null;
    expectedValue: AlarmExpectedValue;
    severity: AlarmSeverity;
    label: string;
}

export interface AlarmEventPayloadDto {
    edgeId: string;
    eventType: AlarmEventType;
    sourceId: string;
    deviceId: string;
    metric: string;
    value: AlarmObservedValue;
    ts: number;
    detectedAt: number;
    rule: AlarmRuleSnapshotDto;
}

export interface AlarmIncidentProjectionDto {
    incidentId: string;
    edgeId: string;
    sourceId: string;
    deviceId: string;
    metric: string;
    ruleId: string;
    lifecycleState: AlarmIncidentLifecycleState;
    isActive: boolean;
    isAcknowledged: boolean;
    activatedAt: string;
    clearedAt: string | null;
    acknowledgedAt: string | null;
    acknowledgedBy: string | null;
    latestValue: AlarmObservedValue;
    latestTs: number;
    latestDetectedAt: number;
    rule: AlarmRuleSnapshotDto;
    createdAt: string;
    updatedAt: string;
}

export const ALARM_INCIDENT_LIST_STATES = ['unclosed', 'all'] as const;

export type AlarmIncidentListState = (typeof ALARM_INCIDENT_LIST_STATES)[number];

export const ALARM_INCIDENT_LIST_SORTS = ['latest'] as const;

export type AlarmIncidentListSort = (typeof ALARM_INCIDENT_LIST_SORTS)[number];

export const ALARM_INCIDENT_LIST_ORDERS = ['desc', 'asc'] as const;

export type AlarmIncidentListOrder = (typeof ALARM_INCIDENT_LIST_ORDERS)[number];

export const ALARM_INCIDENT_LIST_DEFAULT_PAGE = 1;
export const ALARM_INCIDENT_LIST_DEFAULT_LIMIT = 50;
export const ALARM_INCIDENT_LIST_MAX_LIMIT = 100;
export const ALARM_INCIDENT_LIST_DEFAULT_STATE: AlarmIncidentListState = 'unclosed';
export const ALARM_INCIDENT_LIST_DEFAULT_SORT: AlarmIncidentListSort = 'latest';
export const ALARM_INCIDENT_LIST_DEFAULT_ORDER: AlarmIncidentListOrder = 'desc';

export interface AlarmIncidentListQueryDto {
    state: AlarmIncidentListState;
    page: number;
    limit: number;
    sort: AlarmIncidentListSort;
    order: AlarmIncidentListOrder;
}

export interface AlarmIncidentListResponseDto {
    incidents: AlarmIncidentProjectionDto[];
    page: number;
    limit: number;
    total: number;
    hasNextPage: boolean;
}

export interface AlarmIncidentChangedEventDto {
    edgeId: string;
    incident: AlarmIncidentProjectionDto;
}

export interface AlarmIncidentAckResponseDto {
    status: 'success';
    data: {
        incident: AlarmIncidentProjectionDto;
    };
}
