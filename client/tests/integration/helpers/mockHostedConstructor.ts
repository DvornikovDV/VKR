import { vi } from 'vitest'
import type {
  DirtyState,
  EditorDeviceMetricCatalogEntry,
  EditorMachineOption,
  HostedConstructorCallbacks,
  HostedConstructorConfig,
  HostedConstructorInstance,
  HostedConstructorModule,
  LayoutDocument,
  WidgetBindingRecord,
} from '@/features/constructor-host'

export interface MockHostedConstructorHarnessOptions {
  initialLayout?: LayoutDocument
  initialBindings?: WidgetBindingRecord[]
  initialMachines?: EditorMachineOption[]
  initialDeviceCatalog?: EditorDeviceMetricCatalogEntry[]
  initialActiveEdgeServerId?: string | null
}

interface HostedConstructorMockState {
  layout: LayoutDocument
  bindings: WidgetBindingRecord[]
  machines: EditorMachineOption[]
  deviceCatalog: EditorDeviceMetricCatalogEntry[]
  activeEdgeServerId: string | null
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createInitialState(
  options: MockHostedConstructorHarnessOptions,
): HostedConstructorMockState {
  return {
    layout: cloneSerializable(options.initialLayout ?? {}),
    bindings: cloneSerializable(options.initialBindings ?? []),
    machines: cloneSerializable(options.initialMachines ?? []),
    deviceCatalog: cloneSerializable(options.initialDeviceCatalog ?? []),
    activeEdgeServerId: options.initialActiveEdgeServerId ?? null,
  }
}

export function createMockHostedConstructorHarness(options: MockHostedConstructorHarnessOptions = {}) {
  const initialState = createInitialState(options)

  let callbacks: HostedConstructorCallbacks | null = null
  let state: HostedConstructorMockState = createInitialState(options)
  const configHistory: HostedConstructorConfig[] = []

  const loadLayoutMock = vi.fn(async (layout: LayoutDocument) => {
    state.layout = cloneSerializable(layout)
  })

  const getLayoutMock = vi.fn(async () => cloneSerializable(state.layout))

  const loadBindingsMock = vi.fn(async (bindings: WidgetBindingRecord[]) => {
    state.bindings = cloneSerializable(bindings)
  })

  const getBindingsMock = vi.fn(async () => cloneSerializable(state.bindings))

  const updateCatalogMock = vi.fn(
    (input: { machines: EditorMachineOption[]; deviceCatalog: EditorDeviceMetricCatalogEntry[] }) => {
      state.machines = cloneSerializable(input.machines)
      state.deviceCatalog = cloneSerializable(input.deviceCatalog)
    },
  )

  const setActiveMachineMock = vi.fn((edgeServerId: string | null) => {
    state.activeEdgeServerId = edgeServerId
  })

  const destroyMock = vi.fn()

  const instance: HostedConstructorInstance = {
    loadLayout: loadLayoutMock,
    getLayout: getLayoutMock,
    loadBindings: loadBindingsMock,
    getBindings: getBindingsMock,
    updateCatalog: updateCatalogMock,
    setActiveMachine: setActiveMachineMock,
    destroy: destroyMock,
  }

  const createHostedConstructorMock = vi.fn(
    async (config: HostedConstructorConfig): Promise<HostedConstructorInstance> => {
      callbacks = config.callbacks
      configHistory.push(config)

      state.layout = cloneSerializable(config.initialLayout)
      state.bindings = cloneSerializable(config.initialBindings ?? [])
      state.machines = cloneSerializable(config.machines ?? [])
      state.deviceCatalog = cloneSerializable(config.deviceCatalog ?? [])
      state.activeEdgeServerId = config.activeEdgeServerId ?? null

      return instance
    },
  )

  const module: HostedConstructorModule = {
    createHostedConstructor: createHostedConstructorMock,
  }

  return {
    module,
    instance,
    createHostedConstructorMock,
    instanceSpies: {
      loadLayoutMock,
      getLayoutMock,
      loadBindingsMock,
      getBindingsMock,
      updateCatalogMock,
      setActiveMachineMock,
      destroyMock,
    },
    getLastConfig: () => configHistory[configHistory.length - 1],
    getConfigHistory: () => [...configHistory],
    getState: () => cloneSerializable(state),
    emitDirtyStateChange: (dirtyState: DirtyState) => callbacks?.onDirtyStateChange(dirtyState),
    emitSaveLayoutIntent: () => callbacks?.onSaveLayoutIntent(),
    emitSaveAsIntent: () => callbacks?.onSaveAsIntent(),
    emitSaveBindingsIntent: () => callbacks?.onSaveBindingsIntent(),
    emitMachineChange: (edgeServerId: string | null) => callbacks?.onMachineChange(edgeServerId),
    emitFatalError: (error: Error = new Error('Mock hosted constructor fatal error')) =>
      callbacks?.onFatalError(error),
    reset: () => {
      callbacks = null
      state = cloneSerializable(initialState)
      configHistory.length = 0

      createHostedConstructorMock.mockReset()
      createHostedConstructorMock.mockImplementation(
        async (config: HostedConstructorConfig): Promise<HostedConstructorInstance> => {
          callbacks = config.callbacks
          configHistory.push(config)

          state.layout = cloneSerializable(config.initialLayout)
          state.bindings = cloneSerializable(config.initialBindings ?? [])
          state.machines = cloneSerializable(config.machines ?? [])
          state.deviceCatalog = cloneSerializable(config.deviceCatalog ?? [])
          state.activeEdgeServerId = config.activeEdgeServerId ?? null

          return instance
        },
      )

      loadLayoutMock.mockClear()
      getLayoutMock.mockClear()
      loadBindingsMock.mockClear()
      getBindingsMock.mockClear()
      updateCatalogMock.mockClear()
      setActiveMachineMock.mockClear()
      destroyMock.mockClear()
    },
  }
}

export type MockHostedConstructorHarness = ReturnType<typeof createMockHostedConstructorHarness>
