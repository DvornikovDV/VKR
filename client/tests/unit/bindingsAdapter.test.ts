import { describe, expect, it } from 'vitest'
import {
  BindingsPayloadError,
  exportWidgetBindingsPayload,
  findBindingSetForEdgeServer,
  importBindingSetsPayload,
  importBindingSetsPayloadWithRecovery,
  importWidgetBindingsPayload,
  isBindingsPayloadError,
} from '@/features/constructor-host/adapters/bindingsAdapter'

describe('bindingsAdapter', () => {
  it('normalizes and clones widget bindings payloads on import/export', () => {
    const raw = [{ widgetId: ' widget-1 ', deviceId: ' device-1 ', metric: ' temperature ' }]

    const imported = importWidgetBindingsPayload(raw)
    const exported = exportWidgetBindingsPayload(raw)

    expect(imported).toEqual([{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }])
    expect(exported).toEqual([{ widgetId: 'widget-1', deviceId: 'device-1', metric: 'temperature' }])

    raw[0].widgetId = 'changed-after-normalization'
    expect(imported[0]?.widgetId).toBe('widget-1')
    expect(exported[0]?.widgetId).toBe('widget-1')
  })

  it('throws tagged validation errors for malformed widget bindings payload', () => {
    expect(() => importWidgetBindingsPayload({})).toThrow(BindingsPayloadError)
    expect(() => importWidgetBindingsPayload([{ widgetId: '', deviceId: 'd1', metric: 'm1' }])).toThrow(
      BindingsPayloadError,
    )
    expect(() => exportWidgetBindingsPayload([{ widgetId: 'w1', deviceId: 42, metric: 'm1' }])).toThrow(
      BindingsPayloadError,
    )
  })

  it('imports binding sets with optional metadata and trimmed identifiers', () => {
    const payload = [
      {
        _id: ' set-1 ',
        diagramId: ' diagram-1 ',
        edgeServerId: ' edge-1 ',
        createdAt: ' 2026-03-25T00:00:00.000Z ',
        updatedAt: ' 2026-03-25T01:00:00.000Z ',
        widgetBindings: [{ widgetId: ' w1 ', deviceId: ' d1 ', metric: ' flow ' }],
      },
    ]

    const imported = importBindingSetsPayload(payload)

    expect(imported).toEqual([
      {
        _id: 'set-1',
        diagramId: 'diagram-1',
        edgeServerId: 'edge-1',
        createdAt: '2026-03-25T00:00:00.000Z',
        updatedAt: '2026-03-25T01:00:00.000Z',
        widgetBindings: [{ widgetId: 'w1', deviceId: 'd1', metric: 'flow' }],
      },
    ])
  })

  it('recovers valid entries and reports singular invalid-entry details', () => {
    const result = importBindingSetsPayloadWithRecovery([
      {
        edgeServerId: 'edge-1',
        widgetBindings: [{ widgetId: 'w1', deviceId: 'd1', metric: 'temperature' }],
      },
      {
        edgeServerId: 'edge-2',
        widgetBindings: [{ widgetId: '', deviceId: 'd2', metric: 'pressure' }],
      },
    ])

    expect(result.bindingSets).toHaveLength(1)
    expect(result.bindingSets[0]?.edgeServerId).toBe('edge-1')
    expect(result.recoveryError).toBeInstanceOf(BindingsPayloadError)
    expect(result.recoveryError?.message).toContain('1 invalid entry skipped, 1/2 kept.')
  })

  it('reports plural invalid-entry details and handles non-array payload in recovery mode', () => {
    const pluralResult = importBindingSetsPayloadWithRecovery([
      {
        edgeServerId: 'edge-1',
        widgetBindings: [{ widgetId: '', deviceId: 'd1', metric: 'temperature' }],
      },
      {
        edgeServerId: 'edge-2',
        widgetBindings: [{ widgetId: '', deviceId: 'd2', metric: 'pressure' }],
      },
      {
        edgeServerId: 'edge-3',
        widgetBindings: [{ widgetId: 'w3', deviceId: 'd3', metric: 'flow' }],
      },
    ])

    expect(pluralResult.bindingSets).toHaveLength(1)
    expect(pluralResult.recoveryError?.message).toContain('2 invalid entries skipped, 1/3 kept.')

    const nonArrayResult = importBindingSetsPayloadWithRecovery({ invalid: true })
    expect(nonArrayResult.bindingSets).toEqual([])
    expect(nonArrayResult.recoveryError).toBeInstanceOf(BindingsPayloadError)
    expect(nonArrayResult.recoveryError?.path).toBe('bindings')
  })

  it('recognizes tagged errors and resolves binding sets by edge server id', () => {
    const taggedError = new Error('Tagged payload error') as Error & { _tag: string }
    taggedError._tag = 'BindingsPayloadError'

    expect(isBindingsPayloadError(new BindingsPayloadError('known'))).toBe(true)
    expect(isBindingsPayloadError(taggedError)).toBe(true)
    expect(isBindingsPayloadError(new Error('plain'))).toBe(false)

    const bindingSets = [
      { edgeServerId: 'edge-1', widgetBindings: [{ widgetId: 'w1', deviceId: 'd1', metric: 'm1' }] },
    ]
    expect(findBindingSetForEdgeServer(bindingSets, 'edge-1')?.edgeServerId).toBe('edge-1')
    expect(findBindingSetForEdgeServer(bindingSets, '')).toBeNull()
    expect(findBindingSetForEdgeServer(bindingSets, null)).toBeNull()
    expect(findBindingSetForEdgeServer(bindingSets, 'edge-x')).toBeNull()
  })
})
