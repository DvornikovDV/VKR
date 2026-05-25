import type { LayoutDocument } from '@/features/constructor-host/types'
import type { DiagramBindingSetRecord } from '@/features/constructor-host/adapters/bindingsAdapter'

export interface LayoutBindingImpact {
  layoutWidgetIds: string[]
  boundWidgetIds: string[]
  removedBoundWidgetIds: string[]
  isDestructive: boolean
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function getLayoutWidgetIds(layout: LayoutDocument): string[] {
  const widgets = Array.isArray(layout.widgets) ? layout.widgets : []
  const ids = new Set<string>()

  widgets.forEach((widget) => {
    if (!isRecord(widget)) {
      return
    }

    const widgetId = normalizeId(widget.id)
    if (widgetId) {
      ids.add(widgetId)
    }
  })

  return Array.from(ids)
}

export function getBoundWidgetIds(bindingSets: DiagramBindingSetRecord[]): string[] {
  const ids = new Set<string>()

  bindingSets.forEach((bindingSet) => {
    bindingSet.widgetBindings.forEach((binding) => {
      const widgetId = normalizeId(binding.widgetId)
      if (widgetId) {
        ids.add(widgetId)
      }
    })

    bindingSet.commandBindings.forEach((binding) => {
      const widgetId = normalizeId(binding.widgetId)
      if (widgetId) {
        ids.add(widgetId)
      }
    })
  })

  return Array.from(ids)
}

export function getLayoutBindingImpact(
  layout: LayoutDocument,
  bindingSets: DiagramBindingSetRecord[],
): LayoutBindingImpact {
  const layoutWidgetIds = getLayoutWidgetIds(layout)
  const boundWidgetIds = getBoundWidgetIds(bindingSets)
  const layoutWidgetIdSet = new Set(layoutWidgetIds)
  const removedBoundWidgetIds = boundWidgetIds.filter((widgetId) => !layoutWidgetIdSet.has(widgetId))

  return {
    layoutWidgetIds,
    boundWidgetIds,
    removedBoundWidgetIds,
    isDestructive: removedBoundWidgetIds.length > 0,
  }
}
