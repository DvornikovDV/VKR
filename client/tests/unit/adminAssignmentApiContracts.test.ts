import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { assignDiagramToUser } from '@/shared/api/diagrams'
import { getUsers, getUsersPage, type PaginatedUsersResponse } from '@/shared/api/users'
import { server } from '../mocks/server'

const userPage: PaginatedUsersResponse = {
  status: 'success',
  data: [
    {
      _id: 'user-101',
      email: 'candidate@example.com',
      role: 'USER',
      subscriptionTier: 'FREE',
      isDeleted: false,
      isBanned: false,
      createdAt: '2026-06-11T00:00:00.000Z',
    },
  ],
  total: 121,
  page: 2,
  limit: 100,
}

describe('Admin assignment API contracts', () => {
  it('preserves pagination metadata while getUsers remains array-compatible', async () => {
    const receivedQueries: string[] = []
    server.use(
      http.get('/api/admin/users', ({ request }) => {
        receivedQueries.push(new URL(request.url).search)
        return HttpResponse.json(userPage)
      }),
    )

    await expect(
      getUsersPage({ search: 'candidate', page: 2, limit: 100, role: 'USER', activeOnly: true }),
    ).resolves.toEqual(userPage)
    await expect(getUsers({ role: 'USER', activeOnly: true })).resolves.toEqual(userPage.data)

    expect(receivedQueries).toEqual([
      '?search=candidate&page=2&limit=100&role=USER&activeOnly=true',
      '?role=USER&activeOnly=true',
    ])
  })

  it('returns assignment-copy provenance from the shared diagram helper', async () => {
    const assignedCopy = {
      _id: 'copy-1',
      name: 'Assigned copy',
      ownerId: 'user-101',
      sourceTemplateId: 'template-1',
      layout: {},
    }
    let receivedPayload: unknown
    server.use(
      http.post('/api/diagrams/:diagramId/assign', async ({ params, request }) => {
        expect(params.diagramId).toBe('template-1')
        receivedPayload = await request.json()
        return HttpResponse.json({ status: 'success', data: assignedCopy })
      }),
    )

    await expect(
      assignDiagramToUser('template-1', { targetUserId: 'user-101' }),
    ).resolves.toEqual(assignedCopy)
    expect(receivedPayload).toEqual({ targetUserId: 'user-101' })
  })
})
