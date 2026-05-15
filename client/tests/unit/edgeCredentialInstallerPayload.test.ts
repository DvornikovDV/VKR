import { describe, expect, it } from 'vitest'
import type { EdgeCredentialDisclosureResponse } from '@/shared/api/edgeServers'
import {
  createEdgeCredentialInstallerPayload,
  serializeEdgeCredentialInstallerPayload,
} from '@/features/admin-hub/model/edgeCredentialInstallerPayload'

describe('edge credential installer payload', () => {
  const disclosure: EdgeCredentialDisclosureResponse = {
    edge: {
      _id: 'edge-507f1f77bcf86cd799439011',
      name: 'Edge Alpha',
      trustedUsers: [
        'user-string-ref',
        {
          _id: 'user-1',
          email: 'operator@example.com',
          role: 'USER',
          subscriptionTier: 'PRO',
        },
      ],
      createdBy: {
        _id: 'admin-1',
        email: 'admin@example.com',
      },
      lifecycleState: 'Active',
      availability: {
        online: false,
        lastSeenAt: '2026-04-15T12:00:00.000Z',
      },
      persistentCredentialVersion: 4,
      lastLifecycleEventAt: '2026-04-15T12:10:00.000Z',
    },
    persistentCredential: {
      edgeId: 'edge-507f1f77bcf86cd799439011',
      credentialSecret: 'persistent-secret-from-cloud',
      version: 4,
      issuedAt: '2026-04-15T12:10:00.000Z',
      instructions: 'Use this secret as the edge runtime persistent credential.',
    },
  }

  it('creates the full Cloud-style disclosure payload with current persistent credential fields', () => {
    expect(createEdgeCredentialInstallerPayload(disclosure)).toEqual({
      edge: disclosure.edge,
      persistentCredential: disclosure.persistentCredential,
    })
  })

  it('serializes the installer payload with stable copy/paste formatting', () => {
    expect(serializeEdgeCredentialInstallerPayload(disclosure)).toBe(`{
  "edge": {
    "_id": "edge-507f1f77bcf86cd799439011",
    "name": "Edge Alpha",
    "trustedUsers": [
      "user-string-ref",
      {
        "_id": "user-1",
        "email": "operator@example.com",
        "role": "USER",
        "subscriptionTier": "PRO"
      }
    ],
    "createdBy": {
      "_id": "admin-1",
      "email": "admin@example.com"
    },
    "lifecycleState": "Active",
    "availability": {
      "online": false,
      "lastSeenAt": "2026-04-15T12:00:00.000Z"
    },
    "persistentCredentialVersion": 4,
    "lastLifecycleEventAt": "2026-04-15T12:10:00.000Z"
  },
  "persistentCredential": {
    "edgeId": "edge-507f1f77bcf86cd799439011",
    "credentialSecret": "persistent-secret-from-cloud",
    "version": 4,
    "issuedAt": "2026-04-15T12:10:00.000Z",
    "instructions": "Use this secret as the edge runtime persistent credential."
  }
}`)
  })
})
