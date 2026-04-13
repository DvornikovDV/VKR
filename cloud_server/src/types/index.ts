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
