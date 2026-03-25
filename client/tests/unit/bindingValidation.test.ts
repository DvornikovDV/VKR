import { describe, expect, it } from 'vitest'
import {
  resolveBindingProfileForEdge,
  validateBindingProfileAgainstSavedWidgets,
} from '@/features/dashboard/model/bindingValidation'
import type {
  DashboardBindingProfile,
  DashboardLayoutDocument,
} from '@/features/dashboard/model/types'

const savedLayout: DashboardLayoutDocument = {
  widgets: [
    { id: 'widget-number', type: 'number-display' },
    { id: 'widget-text', type: 'text-display' },
  ],
}

const bindingProfiles: DashboardBindingProfile[] = [
  {
    _id: 'binding-edge-1',
    diagramId: 'diagram-1',
    edgeServerId: 'edge-1',
    widgetBindings: [
      { widgetId: 'widget-number', deviceId: 'pump-1', metric: 'temperature' },
      { widgetId: 'widget-text', deviceId: 'pump-1', metric: 'status' },
    ],
  },
]

describe('bindingValidation (T020)', () => {
  it('resolves missing binding profile state when selected edge has no saved profile', () => {
    const selectedProfile = resolveBindingProfileForEdge(bindingProfiles, 'edge-2')

    const validation = validateBindingProfileAgainstSavedWidgets(selectedProfile, savedLayout)

    expect(selectedProfile).toBeNull()
    expect(validation.state).toBe('missing-binding-profile')
    expect(validation.isValid).toBe(false)
    expect(validation.savedWidgetIds).toEqual(['widget-number', 'widget-text'])
  })

  it('marks stale widget references as invalid-binding-profile', () => {
    const staleProfile: DashboardBindingProfile = {
      _id: 'binding-stale',
      diagramId: 'diagram-1',
      edgeServerId: 'edge-1',
      widgetBindings: [
        { widgetId: 'widget-number', deviceId: 'pump-1', metric: 'temperature' },
        { widgetId: 'widget-deleted', deviceId: 'pump-1', metric: 'pressure' },
      ],
    }

    const validation = validateBindingProfileAgainstSavedWidgets(staleProfile, savedLayout)

    expect(validation.state).toBe('invalid-binding-profile')
    expect(validation.isValid).toBe(false)
    expect(validation.missingWidgetIds).toEqual(['widget-deleted'])
  })

  it('keeps valid profile state for matching saved widget ids', () => {
    const selectedProfile = resolveBindingProfileForEdge(bindingProfiles, 'edge-1')
    const validation = validateBindingProfileAgainstSavedWidgets(selectedProfile, savedLayout)

    expect(selectedProfile?._id).toBe('binding-edge-1')
    expect(validation.state).toBe('valid')
    expect(validation.isValid).toBe(true)
    expect(validation.missingWidgetIds).toEqual([])
    expect(validation.bindingWidgetIds).toEqual(['widget-number', 'widget-text'])
  })
})
