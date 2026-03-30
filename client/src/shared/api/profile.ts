import { apiClient } from '@/shared/api/client'

export type ProfileRole = 'ADMIN' | 'USER'
export type ProfileTier = 'FREE' | 'PRO'

export interface ProfileSessionContext {
  id: string
  email: string
  role: ProfileRole
  tier: ProfileTier
}

interface UserProfileStatsResponse {
  diagramCount: number
  edgeServerCount: number
}

export interface UserProfileSummary {
  id: string
  email: string
  role: ProfileRole
  tier: ProfileTier
  diagramsUsed: number
  diagramsLimit: number | null
  equipmentUsed: number
  equipmentLimit: number | null
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

export const FREE_DIAGRAM_LIMIT = 3
export const FREE_EQUIPMENT_LIMIT = 1

function resolveTierLimits(tier: ProfileTier): Pick<UserProfileSummary, 'diagramsLimit' | 'equipmentLimit'> {
  if (tier === 'PRO') {
    return {
      diagramsLimit: null,
      equipmentLimit: null,
    }
  }

  return {
    diagramsLimit: FREE_DIAGRAM_LIMIT,
    equipmentLimit: FREE_EQUIPMENT_LIMIT,
  }
}

export async function getProfileSummary(
  session: ProfileSessionContext,
): Promise<UserProfileSummary> {
  const stats = await apiClient.get<UserProfileStatsResponse>('/users/me/stats')
  const limits = resolveTierLimits(session.tier)

  return {
    id: session.id,
    email: session.email,
    role: session.role,
    tier: session.tier,
    diagramsUsed: stats.diagramCount,
    diagramsLimit: limits.diagramsLimit,
    equipmentUsed: stats.edgeServerCount,
    equipmentLimit: limits.equipmentLimit,
  }
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.post<void>('/users/me/password', payload)
}
