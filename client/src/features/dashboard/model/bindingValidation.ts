import type {
  DashboardBindingProfile,
  DashboardLayoutDocument,
  DashboardWidget,
} from '@/features/dashboard/model/types'

export type DashboardBindingValidationState =
  | 'valid'
  | 'missing-binding-profile'
  | 'invalid-binding-profile'

export interface DashboardBindingValidationResult {
  state: DashboardBindingValidationState
  isValid: boolean
  savedWidgetIds: string[]
  bindingWidgetIds: string[]
  missingWidgetIds: string[]
}

function normalizeWidgetId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toDashboardWidgets(layout: DashboardLayoutDocument): DashboardWidget[] {
  if (!layout || typeof layout !== 'object') {
    return []
  }

  if (!Array.isArray(layout.widgets)) {
    return []
  }

  return layout.widgets.filter(
    (widget): widget is DashboardWidget =>
      Boolean(widget) && typeof widget === 'object' && !Array.isArray(widget),
  )
}

export function extractSavedWidgetIds(layout: DashboardLayoutDocument): string[] {
  const ids = new Set<string>()

  for (const widget of toDashboardWidgets(layout)) {
    const widgetId = normalizeWidgetId(widget.id)
    if (!widgetId) {
      continue
    }

    ids.add(widgetId)
  }

  return Array.from(ids)
}

export function extractBindingWidgetIds(bindingProfile: DashboardBindingProfile): string[] {
  const ids = new Set<string>()

  for (const binding of bindingProfile.widgetBindings) {
    const widgetId = normalizeWidgetId(binding.widgetId)
    if (!widgetId) {
      continue
    }

    ids.add(widgetId)
  }

  return Array.from(ids)
}

export function findMissingBindingWidgetIds(
  bindingProfile: DashboardBindingProfile,
  savedWidgetIds: Iterable<string>,
): string[] {
  const savedSet = new Set<string>(savedWidgetIds)
  const missing = new Set<string>()

  for (const widgetId of extractBindingWidgetIds(bindingProfile)) {
    if (!savedSet.has(widgetId)) {
      missing.add(widgetId)
    }
  }

  return Array.from(missing)
}

export function validateBindingProfileAgainstSavedWidgets(
  bindingProfile: DashboardBindingProfile | null | undefined,
  layout: DashboardLayoutDocument,
): DashboardBindingValidationResult {
  const savedWidgetIds = extractSavedWidgetIds(layout)

  if (!bindingProfile) {
    return {
      state: 'missing-binding-profile',
      isValid: false,
      savedWidgetIds,
      bindingWidgetIds: [],
      missingWidgetIds: [],
    }
  }

  const bindingWidgetIds = extractBindingWidgetIds(bindingProfile)
  const missingWidgetIds = findMissingBindingWidgetIds(bindingProfile, savedWidgetIds)

  if (missingWidgetIds.length > 0) {
    return {
      state: 'invalid-binding-profile',
      isValid: false,
      savedWidgetIds,
      bindingWidgetIds,
      missingWidgetIds,
    }
  }

  return {
    state: 'valid',
    isValid: true,
    savedWidgetIds,
    bindingWidgetIds,
    missingWidgetIds: [],
  }
}
