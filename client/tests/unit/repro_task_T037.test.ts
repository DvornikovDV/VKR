import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const patchMock = vi.fn()

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    patch: patchMock,
  },
}))

describe('repro T037', () => {
  beforeEach(() => {
    getMock.mockReset()
    patchMock.mockReset()
  })

  it('loads profile summary from self-service profile and stats endpoints', async () => {
    getMock.mockImplementation(async (endpoint: string) => {
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

    const profileApi = await import('@/shared/api/profile')
    const result = await profileApi.getProfileSummary()

    expect(getMock).toHaveBeenCalledWith('/users/me')
    expect(getMock).toHaveBeenCalledWith('/users/me/stats')
    expect(result).toEqual({
      id: 'user-1',
      email: 'fresh-user@example.com',
      role: 'USER',
      tier: 'PRO',
      diagramsUsed: 2,
      diagramsLimit: null,
      equipmentUsed: 1,
      equipmentLimit: null,
    })
  })

  it('patches password updates through the self-service endpoint', async () => {
    patchMock.mockResolvedValue(undefined)

    const profileApi = await import('@/shared/api/profile')
    await profileApi.changePassword({
      currentPassword: 'old-password-1',
      newPassword: 'new-password-2',
    })

    expect(patchMock).toHaveBeenCalledWith('/users/me/password', {
      currentPassword: 'old-password-1',
      newPassword: 'new-password-2',
    })
  })
})
