import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDiagramLimits, type DiagramLimitItem } from '@/shared/hooks/useDiagramLimits'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'

const freeSession: Session = {
  id: 'user-free',
  email: 'free@example.com',
  role: 'USER',
  tier: 'FREE',
  accessToken: 'free-token',
}

const proSession: Session = {
  id: 'user-pro',
  email: 'pro@example.com',
  role: 'USER',
  tier: 'PRO',
  accessToken: 'pro-token',
}

const diagrams: DiagramLimitItem[] = [
  { id: 'd1', updatedAt: '2026-03-01T10:00:00.000Z' },
  { id: 'd2', updatedAt: '2026-03-02T10:00:00.000Z' },
  { id: 'd3', updatedAt: '2026-03-03T10:00:00.000Z' },
  { id: 'd4', updatedAt: '2026-03-04T10:00:00.000Z' },
]

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
  })
})

describe('useDiagramLimits', () => {
  it('FREE tier: blocks create/clone at 3 diagrams', () => {
    act(() => {
      useAuthStore.getState().setSession(freeSession)
    })

    const { result } = renderHook(() => useDiagramLimits(diagrams.slice(0, 3)))

    expect(result.current.canCreate()).toBe(false)
    expect(result.current.canClone()).toBe(false)
  })

  it('FREE tier: allows create/clone below 3 diagrams', () => {
    act(() => {
      useAuthStore.getState().setSession(freeSession)
    })

    const { result } = renderHook(() => useDiagramLimits(diagrams.slice(0, 2)))

    expect(result.current.canCreate()).toBe(true)
    expect(result.current.canClone()).toBe(true)
  })

  it('FREE tier: canEdit false for diagrams outside top-3 updatedAt when over limit', () => {
    act(() => {
      useAuthStore.getState().setSession(freeSession)
    })

    const { result } = renderHook(() => useDiagramLimits(diagrams))

    expect(result.current.canEdit(diagrams[3])).toBe(true)
    expect(result.current.canEdit(diagrams[2])).toBe(true)
    expect(result.current.canEdit(diagrams[1])).toBe(true)
    expect(result.current.canEdit(diagrams[0])).toBe(false)
  })

  it('PRO tier: unlimited create/clone and edit access', () => {
    act(() => {
      useAuthStore.getState().setSession(proSession)
    })

    const { result } = renderHook(() => useDiagramLimits(diagrams))

    expect(result.current.canCreate()).toBe(true)
    expect(result.current.canClone()).toBe(true)
    for (const diagram of diagrams) {
      expect(result.current.canEdit(diagram)).toBe(true)
    }
  })
})
