import { describe, expect, it, vi } from 'vitest'
import type { HostedConstructorConfig } from '@/features/constructor-host'
import { createMockHostedConstructorHarness } from '../integration/helpers/mockHostedConstructor'

describe('createMockHostedConstructorHarness', () => {
  it('captures hosted config and mirrors state through runtime instance methods', async () => {
    const harness = createMockHostedConstructorHarness({
      initialLayout: { widgets: [{ id: 'w-init' }] },
      initialBindings: [{ widgetId: 'w-init', deviceId: 'dev-1', metric: 'temp' }],
      initialActiveEdgeServerId: 'edge-1',
    })

    const config: HostedConstructorConfig = {
      container: document.createElement('div'),
      mode: 'full',
      initialLayout: { widgets: [{ id: 'w-1' }] },
      initialBindings: [{ widgetId: 'w-1', deviceId: 'dev-1', metric: 'pressure' }],
      activeEdgeServerId: 'edge-9',
      machines: [{ edgeServerId: 'edge-9', label: 'Edge 9' }],
      deviceCatalog: [
        {
          edgeServerId: 'edge-9',
          deviceId: 'dev-1',
          deviceLabel: 'Sensor 1',
          metrics: [{ key: 'pressure', label: 'Pressure' }],
        },
      ],
      callbacks: {
        onDirtyStateChange: vi.fn(),
        onSaveLayoutIntent: vi.fn(),
        onSaveAsIntent: vi.fn(),
        onSaveBindingsIntent: vi.fn(),
        onMachineChange: vi.fn(),
        onFatalError: vi.fn(),
      },
    }

    const runtime = await harness.module.createHostedConstructor(config)
    await runtime.loadLayout({ widgets: [{ id: 'w-2' }] })
    await runtime.loadBindings([{ widgetId: 'w-2', deviceId: 'dev-2', metric: 'temp' }])

    expect(harness.getLastConfig()).toBe(config)
    expect(await runtime.getLayout()).toEqual({ widgets: [{ id: 'w-2' }] })
    expect(await runtime.getBindings()).toEqual([
      { widgetId: 'w-2', deviceId: 'dev-2', metric: 'temp' },
    ])
    expect(harness.getState().activeEdgeServerId).toBe('edge-9')
  })

  it('emits constructor callbacks through harness helpers', async () => {
    const onDirtyStateChange = vi.fn()
    const onSaveLayoutIntent = vi.fn()
    const onSaveAsIntent = vi.fn()
    const onSaveBindingsIntent = vi.fn()
    const onMachineChange = vi.fn()
    const onFatalError = vi.fn()

    const harness = createMockHostedConstructorHarness()
    await harness.module.createHostedConstructor({
      container: document.createElement('div'),
      mode: 'full',
      initialLayout: {},
      callbacks: {
        onDirtyStateChange,
        onSaveLayoutIntent,
        onSaveAsIntent,
        onSaveBindingsIntent,
        onMachineChange,
        onFatalError,
      },
    })

    const fatalError = new Error('boom')
    harness.emitDirtyStateChange({ layoutDirty: true, bindingsDirty: false })
    harness.emitSaveLayoutIntent()
    harness.emitSaveAsIntent()
    harness.emitSaveBindingsIntent()
    harness.emitMachineChange('edge-2')
    harness.emitFatalError(fatalError)

    expect(onDirtyStateChange).toHaveBeenCalledWith({ layoutDirty: true, bindingsDirty: false })
    expect(onSaveLayoutIntent).toHaveBeenCalledTimes(1)
    expect(onSaveAsIntent).toHaveBeenCalledTimes(1)
    expect(onSaveBindingsIntent).toHaveBeenCalledTimes(1)
    expect(onMachineChange).toHaveBeenCalledWith('edge-2')
    expect(onFatalError).toHaveBeenCalledWith(fatalError)
  })
})
