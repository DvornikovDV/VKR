import { apiClient } from '@/shared/api/client'

export type ProfileRole = 'ADMIN' | 'USER'
export type ProfileTier = 'FREE' | 'PRO'

interface SelfProfileResponse {
  _id: string
  email: string
  role: ProfileRole
  subscriptionTier: ProfileTier
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
): Promise<UserProfileSummary> {
  const [profile, stats] = await Promise.all([
    apiClient.get<SelfProfileResponse>('/users/me'),
    apiClient.get<UserProfileStatsResponse>('/users/me/stats'),
  ])
  const limits = resolveTierLimits(profile.subscriptionTier)

  return {
    id: profile._id,
    email: profile.email,
    role: profile.role,
    tier: profile.subscriptionTier,
    diagramsUsed: stats.diagramCount,
    diagramsLimit: limits.diagramsLimit,
    equipmentUsed: stats.edgeServerCount,
    equipmentLimit: limits.equipmentLimit,
  }
}

export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  await apiClient.patch<void>('/users/me/password', payload)
}
