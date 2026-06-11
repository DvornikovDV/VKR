import { apiClient } from '@/shared/api/client'

export type UserRole = 'ADMIN' | 'USER'
export type SubscriptionTier = 'FREE' | 'PRO'

export interface UserRow {
  _id: string
  email: string
  role: UserRole
  subscriptionTier: SubscriptionTier
  isDeleted: boolean
  isBanned: boolean
  createdAt: string
}

export interface GetUsersParams {
  search?: string
  page?: number
  limit?: number
  role?: UserRole
  activeOnly?: boolean
}

export interface PaginatedUsersResponse {
  status: 'success'
  data: UserRow[]
  total: number
  page: number
  limit: number
}

export interface UpdateUserTierPayload {
  tier: SubscriptionTier
}

export interface UpdateUserBanPayload {
  isBanned: boolean
}

function buildUsersQuery(params: GetUsersParams = {}): string {
  const query = new URLSearchParams()

  if (params.search) {
    query.set('search', params.search)
  }

  if (params.page !== undefined) {
    query.set('page', String(params.page))
  }

  if (params.limit !== undefined) {
    query.set('limit', String(params.limit))
  }

  if (params.role !== undefined) {
    query.set('role', params.role)
  }

  if (params.activeOnly !== undefined) {
    query.set('activeOnly', String(params.activeOnly))
  }

  const qs = query.toString()
  return qs ? `/admin/users?${qs}` : '/admin/users'
}

export async function getUsers(params: GetUsersParams = {}): Promise<UserRow[]> {
  return (await getUsersPage(params)).data
}

export async function getUsersPage(
  params: GetUsersParams = {},
): Promise<PaginatedUsersResponse> {
  return apiClient.getRaw<PaginatedUsersResponse>(buildUsersQuery(params))
}

export async function updateUserTier(
  userId: string,
  payload: UpdateUserTierPayload,
): Promise<void> {
  await apiClient.patch<void>(`/admin/users/${userId}/tier`, payload)
}

export async function updateUserBan(
  userId: string,
  payload: UpdateUserBanPayload,
): Promise<void> {
  await apiClient.patch<void>(`/admin/users/${userId}/status`, payload)
}
