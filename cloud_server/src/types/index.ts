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
