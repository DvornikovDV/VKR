import {
  DISPATCH_ALARMS_TAB,
  DISPATCH_COMMANDS_TAB,
  DISPATCH_DASHBOARD_TAB,
  DISPATCH_TELEMETRY_TAB,
  DISPATCH_TRENDS_TAB,
  getDispatchTabRoute,
  type DispatchTabId,
} from '@/features/dispatch/model/routes'
import type { DispatchWorkspaceContextSnapshot } from '@/features/dispatch/model/types'

export type DispatchPlaceholderTabId = Exclude<
  DispatchTabId,
  | typeof DISPATCH_DASHBOARD_TAB
  | typeof DISPATCH_COMMANDS_TAB
  | typeof DISPATCH_ALARMS_TAB
  | typeof DISPATCH_TELEMETRY_TAB
>

interface DispatchPlaceholderTabProps {
  tabId: DispatchPlaceholderTabId
  workspaceContext: DispatchWorkspaceContextSnapshot
  className?: string
}

const PLACEHOLDER_MESSAGES = {
  [DISPATCH_TRENDS_TAB]: 'Графики трендов и таблицы исторической телеметрии пока не реализованы в этом срезе диспетчеризации.',
} as const satisfies Record<DispatchPlaceholderTabId, string>

function getContextValue(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

export function DispatchPlaceholderTab({
  tabId,
  workspaceContext,
  className,
}: DispatchPlaceholderTabProps) {
  const route = getDispatchTabRoute(tabId)
  const selectedDiagramName = getContextValue(
    workspaceContext.selection.selectedDiagram?.name,
    workspaceContext.selection.diagramId ? 'Неизвестная мнемосхема' : 'Мнемосхема не выбрана',
  )
  const selectedEdgeName = getContextValue(
    workspaceContext.selection.selectedEdge?.name,
    workspaceContext.selection.edgeId ? 'Неизвестный объект' : 'Объект не выбран',
  )

  return (
    <section
      aria-label={`${route.label}: заглушка`}
      className={className ?? 'flex min-h-[18rem] flex-1 flex-col gap-4 bg-[#08111f] p-4'}
    >
      <div className="rounded-md border border-dashed border-[#334155] bg-[#0a1220] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#38bdf8]">
          {route.label}
        </p>
        <h2 className="mt-2 text-base font-semibold text-white">{route.label}: заглушка</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#94a3b8]">
          {PLACEHOLDER_MESSAGES[tabId]} Runtime-сессия и будущие API здесь не запускаются.
        </p>
      </div>

      <dl
        data-testid="dispatch-placeholder-context"
        data-tab-id={tabId}
        className="grid gap-3 rounded-md border border-[#1f2a3d] bg-[#0f172a] p-4 text-sm sm:grid-cols-2"
      >
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Мнемосхема</dt>
          <dd className="mt-1 text-[#e2e8f0]">{selectedDiagramName}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Объект</dt>
          <dd className="mt-1 text-[#e2e8f0]">{selectedEdgeName}</dd>
        </div>
      </dl>
    </section>
  )
}
