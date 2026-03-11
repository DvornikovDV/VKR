import { useMemo } from 'react'
import { useAuthStore } from '@/shared/store/useAuthStore'

export interface DiagramLimitItem {
  id: string
  updatedAt: string
}

interface DiagramLimitsResult {
  canCreate: () => boolean
  canClone: () => boolean
  canEdit: (diagram: DiagramLimitItem) => boolean
}

export function useDiagramLimits(diagrams: DiagramLimitItem[]): DiagramLimitsResult {
  const tier = useAuthStore((state) => state.session?.tier ?? 'FREE')

  const editableIds = useMemo(() => {
    if (tier !== 'FREE') {
      return new Set(diagrams.map((diagram) => diagram.id))
    }

    if (diagrams.length <= 3) {
      return new Set(diagrams.map((diagram) => diagram.id))
    }

    const topThree = [...diagrams]
      .sort((a, b) => {
        const aTime = Number(new Date(a.updatedAt))
        const bTime = Number(new Date(b.updatedAt))
        return bTime - aTime
      })
      .slice(0, 3)

    return new Set(topThree.map((diagram) => diagram.id))
  }, [diagrams, tier])

  const canCreate = (): boolean => tier !== 'FREE' || diagrams.length < 3
  const canClone = (): boolean => tier !== 'FREE' || diagrams.length < 3
  const canEdit = (diagram: DiagramLimitItem): boolean =>
    tier !== 'FREE' || editableIds.has(diagram.id)

  return { canCreate, canClone, canEdit }
}
