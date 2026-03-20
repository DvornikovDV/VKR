import { createConstructorRuntime } from './main.js'

function cloneSerializable(value) {
  if (value === undefined) {
    return undefined
  }

  return JSON.parse(JSON.stringify(value))
}

function isElementNode(value) {
  if (!value || typeof value !== 'object') {
    return false
  }

  if (typeof HTMLElement !== 'undefined') {
    return value instanceof HTMLElement
  }

  return value.nodeType === 1 && typeof value.appendChild === 'function'
}

function assertCallbacks(callbacks) {
  if (!callbacks || typeof callbacks !== 'object') {
    throw new Error('Hosted constructor config must include callbacks.')
  }

  const requiredCallbacks = [
    'onDirtyStateChange',
    'onSaveLayoutIntent',
    'onSaveAsIntent',
    'onSaveBindingsIntent',
    'onMachineChange',
    'onFatalError',
  ]

  for (const callbackName of requiredCallbacks) {
    if (typeof callbacks[callbackName] !== 'function') {
      throw new Error(`Hosted constructor callback is required: ${callbackName}`)
    }
  }
}

function assertHostedConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Hosted constructor config object is required.')
  }

  if (!isElementNode(config.container)) {
    throw new Error('Hosted constructor config must include a valid container HTMLElement.')
  }

  assertCallbacks(config.callbacks)
}

function createHostedShell(mode) {
  const machineVisibilityStyle = mode === 'full' ? '' : 'display: none;'
  const bindingVisibilityStyle = mode === 'full' ? '' : 'display: none;'

  return `
    <header class="toolbar-header">
      <div class="toolbar-content">
        <div class="toolbar-left">
          <h1 class="app-title">Hosted Constructor</h1>
        </div>
        <div class="toolbar-center">
          <div class="dropdown me-3">
            <button class="btn btn-primary dropdown-toggle" type="button">File</button>
            <ul class="dropdown-menu" style="display: block; position: static; margin: 0; border: none; background: transparent; box-shadow: none; padding: 0;">
              <li><a class="dropdown-item" href="#" id="add-image-btn">Add image</a></li>
              <li><a class="dropdown-item" href="#" id="save-schema-btn">Save layout</a></li>
              <li><a class="dropdown-item" href="#" id="load-schema-btn">Load layout</a></li>
              <li style="${bindingVisibilityStyle}"><a class="dropdown-item" href="#" id="save-bindings-btn">Save bindings</a></li>
              <li style="${bindingVisibilityStyle}"><a class="dropdown-item" href="#" id="load-bindings-btn">Load bindings</a></li>
              <li><a class="dropdown-item" href="#" id="clear-btn">Clear</a></li>
            </ul>
          </div>
        </div>
        <div class="toolbar-icons" role="group" aria-label="tools">
          <button id="create-line-btn" type="button" class="btn btn-primary btn-square" title="Create line">/</button>
          <button id="delete-selected-btn" type="button" class="btn btn-danger btn-square" title="Delete selected">X</button>
        </div>
        <div class="toolbar-right" style="${machineVisibilityStyle}">
          <label for="machine-select" class="zoom-label">Machine:</label>
          <select id="machine-select" class="form-select form-select-sm" style="width: auto; min-width: 150px; margin-right: 1rem;">
            <option value="">No machine</option>
          </select>
          <label for="zoom-slider" class="zoom-label">Zoom:</label>
          <input type="range" class="zoom-slider" id="zoom-slider" min="0.1" max="10" step="0.1" value="1">
          <span id="zoom-value" class="zoom-value">1.0x</span>
        </div>
      </div>
    </header>

    <main class="main-workspace">
      <div class="workspace-container">
        <div class="canvas-area">
          <div id="canvas-container" class="canvas-wrapper">
            <div id="canvas"></div>
          </div>
        </div>
        <aside class="properties-panel">
          <div class="properties-header"><h5>Properties</h5></div>
          <div class="properties-content">
            <div id="properties-content">
              <p class="text-muted">Select an element to edit properties</p>
            </div>
          </div>
        </aside>
      </div>
    </main>

    <input type="file" id="file-input" accept="image/*" style="display: none;">
  `
}

function toControllerCatalogInput(machines, deviceCatalog) {
  return {
    machines: Array.isArray(machines) ? machines : [],
    deviceCatalog: Array.isArray(deviceCatalog) ? deviceCatalog : [],
  }
}

export async function createHostedConstructor(config) {
  assertHostedConfig(config)

  const mode = config.mode === 'reduced' ? 'reduced' : 'full'
  const initialLayout = cloneSerializable(config.initialLayout ?? {})
  const initialBindings = cloneSerializable(config.initialBindings ?? [])
  const machines = cloneSerializable(config.machines ?? [])
  const deviceCatalog = cloneSerializable(config.deviceCatalog ?? [])
  const activeEdgeServerId = config.activeEdgeServerId ?? null

  const mountRoot = document.createElement('div')
  mountRoot.setAttribute('data-hosted-constructor-root', 'true')
  mountRoot.className = 'hosted-constructor-root'
  mountRoot.innerHTML = createHostedShell(mode)
  config.container.appendChild(mountRoot)

  const controller = createConstructorRuntime({
    hostedRuntime: true,
    hostedConfig: {
      ...config,
      mode,
      container: mountRoot,
      machines,
      deviceCatalog,
      activeEdgeServerId,
      initialBindings,
    },
  })

  try {
    await controller.ready()
    await controller.loadLayout(initialLayout)

    if (mode === 'full') {
      controller.updateCatalog(toControllerCatalogInput(machines, deviceCatalog))
      controller.setActiveMachine(activeEdgeServerId)
      await controller.loadBindings(initialBindings)
    }

    config.callbacks.onDirtyStateChange({ layoutDirty: false, bindingsDirty: false })
  } catch (error) {
    try {
      await controller.destroy()
    } catch {
      // Ignore cleanup errors during bootstrap.
    }

    if (mountRoot.parentNode) {
      mountRoot.parentNode.removeChild(mountRoot)
    }

    throw error
  }

  let isDestroyed = false

  async function withActiveRuntime(action) {
    if (isDestroyed) {
      return undefined
    }

    return action()
  }

  return {
    async loadLayout(layout) {
      await withActiveRuntime(async () => controller.loadLayout(cloneSerializable(layout ?? {})))
    },
    async getLayout() {
      const layout = await withActiveRuntime(async () => controller.getLayout())
      return cloneSerializable(layout ?? {})
    },
    async loadBindings(bindings) {
      if (mode === 'reduced') {
        return
      }

      await withActiveRuntime(async () => controller.loadBindings(cloneSerializable(bindings ?? [])))
    },
    async getBindings() {
      if (mode === 'reduced') {
        return []
      }

      const bindings = await withActiveRuntime(async () => controller.getBindings())
      return cloneSerializable(bindings ?? [])
    },
    updateCatalog(input) {
      if (mode === 'reduced' || isDestroyed) {
        return
      }

      const catalogInput = toControllerCatalogInput(input?.machines, input?.deviceCatalog)
      controller.updateCatalog(catalogInput)
    },
    setActiveMachine(edgeServerId) {
      if (mode === 'reduced' || isDestroyed) {
        return
      }

      controller.setActiveMachine(edgeServerId ?? null)
    },
    async destroy() {
      if (isDestroyed) {
        return
      }

      isDestroyed = true
      await controller.destroy()

      if (mountRoot.parentNode) {
        mountRoot.parentNode.removeChild(mountRoot)
      }
    },
  }
}