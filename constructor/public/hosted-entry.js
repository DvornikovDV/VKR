import { createConstructorRuntime } from './main.js'

const HOSTED_KONVA_SCRIPT_URL = 'https://unpkg.com/konva@8.3.2/konva.min.js'

let konvaLoadPromise = null
const hostedRootCleanupMap = new WeakMap()

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
          <div class="hosted-file-menu" data-file-menu>
            <button
              type="button"
              class="toolbar-btn toolbar-btn-primary hosted-file-toggle"
              data-file-menu-toggle
              aria-haspopup="true"
              aria-expanded="false"
            >
              File
            </button>
            <div class="hosted-file-menu-popover" data-file-menu-popover hidden>
              <button type="button" class="hosted-file-item" id="add-image-btn">Add image</button>
              <button type="button" class="hosted-file-item" id="save-schema-btn">Save layout</button>
              <button type="button" class="hosted-file-item" id="save-as-btn">Save as</button>
              <button type="button" class="hosted-file-item" id="clear-btn">Clear</button>
              <div class="hosted-file-separator" style="${bindingVisibilityStyle}" aria-hidden="true"></div>
              <button type="button" class="hosted-file-item" style="${bindingVisibilityStyle}" id="save-bindings-btn">Save bindings</button>
              <button type="button" class="hosted-file-item" style="${bindingVisibilityStyle}" id="load-bindings-btn">Load bindings</button>
            </div>
          </div>
        </div>
        <div class="toolbar-icons" role="group" aria-label="tools">
          <button id="create-line-btn" type="button" class="toolbar-icon-button toolbar-icon-button-primary" title="Create line">/</button>
          <button id="delete-selected-btn" type="button" class="toolbar-icon-button toolbar-icon-button-danger" title="Delete selected">X</button>
        </div>
        <div class="toolbar-right" style="${machineVisibilityStyle}">
          <label for="machine-select" class="zoom-label">Machine:</label>
          <select id="machine-select" class="machine-select">
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

function removeNode(node) {
  if (node && node.parentNode) {
    node.parentNode.removeChild(node)
  }
}

function removeStaleHostedRoots(container) {
  if (!container || typeof container.querySelectorAll !== 'function') {
    return
  }

  const staleRoots = container.querySelectorAll('[data-hosted-constructor-root="true"]')
  staleRoots.forEach((rootNode) => {
    const cleanup = hostedRootCleanupMap.get(rootNode)
    if (typeof cleanup === 'function') {
      cleanup()
    }
    hostedRootCleanupMap.delete(rootNode)
    removeNode(rootNode)
  })
}

function loadStylesheetIntoRoot(rootNode, href, marker) {
  const existingLink = rootNode.querySelector(`link[data-hosted-asset="${marker}"]`)
  if (existingLink) {
    if (existingLink.sheet) {
      return Promise.resolve(existingLink)
    }
    return new Promise((resolve, reject) => {
      const onLoad = () => {
        existingLink.removeEventListener('load', onLoad)
        existingLink.removeEventListener('error', onError)
        resolve(existingLink)
      }
      const onError = () => {
        existingLink.removeEventListener('load', onLoad)
        existingLink.removeEventListener('error', onError)
        reject(new Error(`Failed to load hosted constructor asset: ${href}`))
      }
      existingLink.addEventListener('load', onLoad)
      existingLink.addEventListener('error', onError)
    })
  }

  return new Promise((resolve, reject) => {
    const linkElement = document.createElement('link')
    linkElement.rel = 'stylesheet'
    linkElement.href = href
    linkElement.setAttribute('data-hosted-asset', marker)

    const onLoad = () => {
      linkElement.removeEventListener('load', onLoad)
      linkElement.removeEventListener('error', onError)
      resolve(linkElement)
    }
    const onError = () => {
      linkElement.removeEventListener('load', onLoad)
      linkElement.removeEventListener('error', onError)
      reject(new Error(`Failed to load hosted constructor asset: ${href}`))
    }

    linkElement.addEventListener('load', onLoad)
    linkElement.addEventListener('error', onError)
    rootNode.prepend(linkElement)
  })
}

function ensureKonvaLoaded() {
  if (globalThis.Konva && typeof globalThis.Konva.Stage === 'function') {
    return Promise.resolve()
  }

  if (!konvaLoadPromise) {
    konvaLoadPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-hosted-konva="true"]')
      const scriptElement = existingScript || document.createElement('script')

      const cleanup = () => {
        scriptElement.removeEventListener('load', onLoad)
        scriptElement.removeEventListener('error', onError)
      }
      const onLoad = () => {
        cleanup()
        if (globalThis.Konva && typeof globalThis.Konva.Stage === 'function') {
          resolve()
          return
        }
        konvaLoadPromise = null
        reject(new Error('Konva script loaded, but Konva runtime is unavailable.'))
      }
      const onError = () => {
        cleanup()
        konvaLoadPromise = null
        reject(new Error(`Failed to load Konva runtime from ${HOSTED_KONVA_SCRIPT_URL}`))
      }

      scriptElement.addEventListener('load', onLoad)
      scriptElement.addEventListener('error', onError)

      if (!existingScript) {
        scriptElement.src = HOSTED_KONVA_SCRIPT_URL
        scriptElement.async = true
        scriptElement.setAttribute('data-hosted-konva', 'true')
        document.head.appendChild(scriptElement)
      }
    })
  }

  return konvaLoadPromise
}

async function ensureHostedRuntimeAssets(mountRoot) {
  await Promise.all([
    loadStylesheetIntoRoot(mountRoot, new URL('./styles.css', import.meta.url).toString(), 'constructor-styles'),
    ensureKonvaLoaded(),
  ])
}

function initializeHostedFileMenu(rootNode) {
  const menuRoot = rootNode.querySelector('[data-file-menu]')
  const toggleButton = menuRoot && menuRoot.querySelector('[data-file-menu-toggle]')
  const menuPopover = menuRoot && menuRoot.querySelector('[data-file-menu-popover]')
  if (!menuRoot || !toggleButton || !menuPopover) {
    return () => undefined
  }

  const menuItems = Array.from(menuPopover.querySelectorAll('button'))
  const ownerDocument = rootNode.ownerDocument || document
  let isOpen = false

  const setOpen = (nextValue) => {
    isOpen = nextValue
    menuRoot.classList.toggle('open', nextValue)
    toggleButton.setAttribute('aria-expanded', String(nextValue))
    menuPopover.hidden = !nextValue
  }

  const handleToggleClick = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen(!isOpen)
  }

  const handleOutsideClick = (event) => {
    if (event.target && !menuRoot.contains(event.target)) {
      setOpen(false)
    }
  }

  const handleEscape = (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  toggleButton.addEventListener('click', handleToggleClick)
  ownerDocument.addEventListener('click', handleOutsideClick)
  ownerDocument.addEventListener('keydown', handleEscape)

  menuItems.forEach((itemNode) => {
    itemNode.addEventListener('click', () => {
      setOpen(false)
    })
  })

  return () => {
    toggleButton.removeEventListener('click', handleToggleClick)
    ownerDocument.removeEventListener('click', handleOutsideClick)
    ownerDocument.removeEventListener('keydown', handleEscape)
    setOpen(false)
  }
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

  removeStaleHostedRoots(config.container)

  const mountRoot = document.createElement('div')
  mountRoot.setAttribute('data-hosted-constructor-root', 'true')
  mountRoot.className = 'hosted-constructor-root'
  mountRoot.style.visibility = 'hidden'
  mountRoot.innerHTML = createHostedShell(mode)
  config.container.appendChild(mountRoot)
  const cleanupFileMenu = initializeHostedFileMenu(mountRoot)
  hostedRootCleanupMap.set(mountRoot, cleanupFileMenu)

  let controller = null

  try {
    await ensureHostedRuntimeAssets(mountRoot)
    mountRoot.style.visibility = ''

    controller = createConstructorRuntime({
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
      if (controller && typeof controller.destroy === 'function') {
        await controller.destroy()
      }
    } catch {
      // Ignore cleanup errors during bootstrap.
    }

    cleanupFileMenu()
    hostedRootCleanupMap.delete(mountRoot)
    removeNode(mountRoot)

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
      if (controller && typeof controller.destroy === 'function') {
        await controller.destroy()
      }

      cleanupFileMenu()
      hostedRootCleanupMap.delete(mountRoot)
      removeNode(mountRoot)
    },
  }
}
