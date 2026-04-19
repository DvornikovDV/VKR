import { describe, expect, it } from 'vitest'
import { server } from '../mocks/server'
import { createAdminEdgeContractHandlers, createDashboardApiFixtures, createDashboardApiHandlers } from '../mocks/handlers'

describe('repro_task_T010', () => {
  it('accepts canonical blocked edge fixtures and serves them unchanged on /api/edge-servers', async () => {
    const fixtures = createDashboardApiFixtures({
      trustedEdges: [
        {
          _id: 'edge-blocked',
          name: 'Blocked Edge',
          lifecycleState: 'Blocked',
          availability: {
            online: false,
            lastSeenAt: '2026-04-17T11:00:00.000Z',
          },
        },
      ],
    })

    server.use(...createDashboardApiHandlers(fixtures))

    const response = await fetch('/api/edge-servers')
    expect(response.ok).toBe(true)

    const payload = (await response.json()) as {
      status: string
      data: Array<{
        _id: string
        name: string
        lifecycleState: 'Active' | 'Blocked'
        availability: {
          online: boolean
          lastSeenAt: string | null
        }
      }>
    }

    expect(payload).toEqual({
      status: 'success',
      data: fixtures.trustedEdges,
    })
  })

  it('serves canonical admin edge contract payloads for fleet, block, rotate, and unblock', async () => {
    const activeEdge = {
      _id: 'edge-active',
      name: 'Active Edge',
      lifecycleState: 'Active' as const,
      availability: {
        online: true,
        lastSeenAt: '2026-04-17T11:05:00.000Z',
      },
      trustedUsers: [],
      createdBy: { _id: 'admin-1', email: 'admin@example.com' },
      persistentCredentialVersion: 2,
      lastLifecycleEventAt: '2026-04-17T11:05:00.000Z',
    }
    const blockedEdge = {
      ...activeEdge,
      lifecycleState: 'Blocked' as const,
      availability: {
        online: false,
        lastSeenAt: '2026-04-17T11:06:00.000Z',
      },
      lastLifecycleEventAt: '2026-04-17T11:06:00.000Z',
    }
    const rotateDisclosure = {
      edge: activeEdge,
      persistentCredential: {
        edgeId: activeEdge._id,
        credentialSecret: 'rotate-secret',
        version: 3,
        issuedAt: '2026-04-17T11:07:00.000Z',
        instructions: 'Use this secret as the edge runtime persistent credential.',
      },
    }
    const unblockDisclosure = {
      edge: activeEdge,
      persistentCredential: {
        edgeId: activeEdge._id,
        credentialSecret: 'unblock-secret',
        version: 4,
        issuedAt: '2026-04-17T11:08:00.000Z',
        instructions: 'Use this secret as the edge runtime persistent credential.',
      },
    }

    server.use(
      ...createAdminEdgeContractHandlers({
        fleet: [activeEdge],
        blockEdgeById: { [activeEdge._id]: blockedEdge },
        rotateDisclosureById: { [activeEdge._id]: rotateDisclosure },
        unblockDisclosureById: { [activeEdge._id]: unblockDisclosure },
      }),
    )

    const fleetResponse = await fetch('/api/admin/edge-servers')
    const blockResponse = await fetch(`/api/edge-servers/${activeEdge._id}/block`, { method: 'POST' })
    const rotateResponse = await fetch(`/api/edge-servers/${activeEdge._id}/rotate-credential`, {
      method: 'POST',
    })
    const unblockResponse = await fetch(`/api/edge-servers/${activeEdge._id}/unblock`, {
      method: 'POST',
    })

    expect(await fleetResponse.json()).toEqual({
      status: 'success',
      data: [activeEdge],
    })
    expect(await blockResponse.json()).toEqual({
      status: 'success',
      data: {
        edge: blockedEdge,
      },
    })
    expect(await rotateResponse.json()).toEqual({
      status: 'success',
      data: rotateDisclosure,
    })
    expect(await unblockResponse.json()).toEqual({
      status: 'success',
      data: unblockDisclosure,
    })
  })
})
