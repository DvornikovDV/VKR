import { describe, expect, it } from 'vitest'
import { getLayoutBindingImpact } from '@/features/constructor-host/adapters/layoutComposition'

describe('layoutComposition', () => {
  it('treats moved or added widgets as non-destructive for saved bindings', () => {
    const impact = getLayoutBindingImpact(
      {
        widgets: [
          { id: 'bound-telemetry', x: 40, y: 80 },
          { id: 'bound-command', x: 120, y: 80 },
          { id: 'new-unbound', x: 180, y: 80 },
        ],
      },
      [
        {
          edgeServerId: 'edge-1',
          widgetBindings: [{ widgetId: 'bound-telemetry', deviceId: 'pump', metric: 'actual_state' }],
          commandBindings: [{ widgetId: 'bound-command', deviceId: 'pump', commandType: 'set_bool' }],
        },
      ],
    )

    expect(impact.isDestructive).toBe(false)
    expect(impact.removedBoundWidgetIds).toEqual([])
  })

  it('treats removing an unbound widget as non-destructive', () => {
    const impact = getLayoutBindingImpact(
      {
        widgets: [{ id: 'bound-telemetry' }],
      },
      [
        {
          edgeServerId: 'edge-1',
          widgetBindings: [{ widgetId: 'bound-telemetry', deviceId: 'pump', metric: 'actual_state' }],
          commandBindings: [],
        },
      ],
    )

    expect(impact.isDestructive).toBe(false)
    expect(impact.removedBoundWidgetIds).toEqual([])
  })

  it('treats removed telemetry-bound and command-bound widgets as destructive', () => {
    const impact = getLayoutBindingImpact(
      {
        widgets: [{ id: 'still-present' }],
      },
      [
        {
          edgeServerId: 'edge-1',
          widgetBindings: [
            { widgetId: 'still-present', deviceId: 'pump', metric: 'actual_state' },
            { widgetId: 'removed-telemetry', deviceId: 'pump', metric: 'pressure' },
          ],
          commandBindings: [
            { widgetId: 'removed-command', deviceId: 'pump', commandType: 'set_bool' },
          ],
        },
      ],
    )

    expect(impact.isDestructive).toBe(true)
    expect(impact.removedBoundWidgetIds).toEqual(['removed-telemetry', 'removed-command'])
  })
})
