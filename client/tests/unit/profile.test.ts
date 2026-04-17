import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiGet, apiPatch } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: apiGet,
    patch: apiPatch,
  },
}))

import { changePassword, getProfileSummary } from '@/shared/api/profile'

describe('profile API', () => {
  beforeEach(() => {
    apiGet.mockReset()
    apiPatch.mockReset()
  })

  it('loads profile summary from self-service profile and stats endpoints', async () => {
    apiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === '/users/me') {
        return {
          _id: 'user-1',
          email: 'fresh-user@example.com',
          role: 'USER',
          subscriptionTier: 'PRO',
        }
      }

      if (endpoint === '/users/me/stats') {
        return {
          diagramCount: 2,
          edgeServerCount: 1,
        }
      }

      throw new Error(`Unexpected endpoint: ${endpoint}`)
    })

    await expect(getProfileSummary()).resolves.toEqual({
      id: 'user-1',
      email: 'fresh-user@example.com',
      role: 'USER',
      tier: 'PRO',
      diagramsUsed: 2,
      diagramsLimit: null,
      equipmentUsed: 1,
      equipmentLimit: null,
    })

    expect(apiGet).toHaveBeenCalledWith('/users/me')
    expect(apiGet).toHaveBeenCalledWith('/users/me/stats')
  })

  it('patches password updates through the self-service endpoint', async () => {
    apiPatch.mockResolvedValueOnce(undefined)

    await changePassword({
      currentPassword: 'old-password-1',
      newPassword: 'new-password-2',
    })

    expect(apiPatch).toHaveBeenCalledWith('/users/me/password', {
      currentPassword: 'old-password-1',
      newPassword: 'new-password-2',
    })
  })
})
