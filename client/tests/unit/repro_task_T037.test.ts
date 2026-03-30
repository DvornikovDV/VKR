import { beforeEach, describe, expect, it, vi } from 'vitest'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
  },
}))

describe('repro T037', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
  })

  it('loads profile summary from user stats and current session context', async () => {
    getMock.mockResolvedValue({
      diagramCount: 2,
      edgeServerCount: 1,
    })

    const profileApi = await import('@/shared/api/profile')
    const result = await profileApi.getProfileSummary({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      tier: 'FREE',
    })

    expect(getMock).toHaveBeenCalledWith('/users/me/stats')
    expect(result).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      tier: 'FREE',
      diagramsUsed: 2,
      diagramsLimit: 3,
      equipmentUsed: 1,
      equipmentLimit: 1,
    })
  })

  it('posts password updates through the self-service endpoint', async () => {
    postMock.mockResolvedValue(undefined)

    const profileApi = await import('@/shared/api/profile')
    await profileApi.changePassword({
      currentPassword: 'old-password-1',
      newPassword: 'new-password-2',
    })

    expect(postMock).toHaveBeenCalledWith('/users/me/password', {
      currentPassword: 'old-password-1',
      newPassword: 'new-password-2',
    })
  })
})
