import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { clsx } from 'clsx'
import type { DispatchTabId } from '@/features/dispatch/model/routes'
import type {
  DispatchActionSlotApi,
  DispatchActionSlotControl,
  DispatchActionSlotRegistration,
  DispatchWorkspaceContextSelection,
} from '@/features/dispatch/model/types'

interface DispatchActionSlotRecord extends DispatchActionSlotRegistration {
  registrationId: number
}

interface DispatchActionSlotContextValue extends DispatchActionSlotApi {
  registrations: DispatchActionSlotRecord[]
  api: DispatchActionSlotApi
}

interface DispatchActionSlotProviderProps {
  children: ReactNode
  activeTabId?: DispatchTabId
  contextKey?: string
}

interface DispatchActionSlotProps {
  activeTabId: DispatchTabId
  contextKey: string
  fallback?: ReactNode
  className?: string
}

const DispatchActionSlotContext = createContext<DispatchActionSlotContextValue | null>(null)

export function createDispatchActionSlotContextKey(
  selection: Pick<DispatchWorkspaceContextSelection, 'diagramId' | 'edgeId'>,
): string {
  return `${selection.diagramId ?? 'no-diagram'}:${selection.edgeId ?? 'no-edge'}`
}

function sortControls(
  left: DispatchActionSlotControl,
  right: DispatchActionSlotControl,
): number {
  const leftOrder = left.order ?? 0
  const rightOrder = right.order ?? 0

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }

  return left.label.localeCompare(right.label)
}

export function DispatchActionSlotProvider({
  children,
  activeTabId,
  contextKey,
}: DispatchActionSlotProviderProps) {
  const [registrations, setRegistrations] = useState<DispatchActionSlotRecord[]>([])
  const nextRegistrationIdRef = useRef(1)

  const register = useCallback((registration: DispatchActionSlotRegistration) => {
    const registrationId = nextRegistrationIdRef.current
    nextRegistrationIdRef.current += 1

    setRegistrations((current) => [
      ...current,
      {
        ...registration,
        registrationId,
      },
    ])

    return () => {
      setRegistrations((current) =>
        current.filter((item) => item.registrationId !== registrationId),
      )
    }
  }, [])

  const clearForTab = useCallback((tabId: DispatchTabId) => {
    setRegistrations((current) => current.filter((item) => item.tabId !== tabId))
  }, [])

  useEffect(() => {
    if (!activeTabId && !contextKey) {
      return
    }

    setRegistrations((current) =>
      current.filter((item) => {
        const isActiveTab = activeTabId ? item.tabId === activeTabId : true
        const isActiveContext = contextKey ? item.contextKey === contextKey : true
        return isActiveTab && isActiveContext
      }),
    )
  }, [activeTabId, contextKey])

  const api = useMemo<DispatchActionSlotApi>(
    () => ({
      register,
      clearForTab,
    }),
    [clearForTab, register],
  )

  const value = useMemo<DispatchActionSlotContextValue>(
    () => ({
      ...api,
      api,
      registrations,
    }),
    [api, registrations],
  )

  return (
    <DispatchActionSlotContext.Provider value={value}>
      {children}
    </DispatchActionSlotContext.Provider>
  )
}

export function useDispatchActionSlot(): DispatchActionSlotApi {
  const value = useContext(DispatchActionSlotContext)

  if (!value) {
    throw new Error('useDispatchActionSlot must be used inside DispatchActionSlotProvider.')
  }

  return value.api
}

export function useRegisterDispatchActionSlot(
  registration: DispatchActionSlotRegistration | null,
): void {
  const actionSlot = useDispatchActionSlot()

  useEffect(() => {
    if (!registration) {
      return undefined
    }

    return actionSlot.register(registration)
  }, [actionSlot, registration])
}

export function DispatchActionSlot({
  activeTabId,
  contextKey,
  fallback = null,
  className,
}: DispatchActionSlotProps) {
  const value = useContext(DispatchActionSlotContext)

  if (!value) {
    throw new Error('DispatchActionSlot must be used inside DispatchActionSlotProvider.')
  }

  const controls = useMemo(
    () =>
      value.registrations
        .filter((registration) => registration.tabId === activeTabId)
        .filter((registration) => registration.contextKey === contextKey)
        .flatMap((registration) =>
          registration.controls.map((control) => ({
            ...control,
            registrationId: registration.registrationId,
          })),
        )
        .sort(sortControls),
    [activeTabId, contextKey, value.registrations],
  )

  if (controls.length === 0) {
    return (
      <div
        aria-label="Dispatch actions"
        data-testid="dispatch-action-slot"
        className={clsx('flex min-h-7 items-center justify-end gap-1', className)}
      >
        {fallback}
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label="Dispatch actions"
      data-testid="dispatch-action-slot"
      className={clsx('flex min-h-7 flex-wrap items-center justify-end gap-1', className)}
    >
      {controls.map((control) => (
        <span
          key={`${control.registrationId}:${control.id}`}
          aria-label={control.label}
          aria-disabled={control.disabled || undefined}
          data-dispatch-action-id={control.id}
          className={clsx(
            'inline-flex items-center',
            control.disabled ? 'pointer-events-none opacity-60' : null,
          )}
        >
          {control.content}
        </span>
      ))}
    </div>
  )
}
