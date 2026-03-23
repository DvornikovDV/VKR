import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..', '..')

const uiControllerModule = await import(
  `${pathToFileURL(path.join(repoRoot, 'constructor', 'public', 'ui-controller.js')).href}?t=${Date.now()}`,
)
const fileManagerModule = await import(
  `${pathToFileURL(path.join(repoRoot, 'constructor', 'public', 'file-manager.js')).href}?t=${Date.now()}`,
)

const { UIController } = uiControllerModule
const { FileManager } = fileManagerModule

const originalFetch = globalThis.fetch
let fetchCalls = 0

globalThis.fetch = async () => {
  fetchCalls += 1
  return {
    ok: true,
    async json() {
      return { devices: [] }
    },
  }
}

const hostedControllerContext = {
  isHostedRuntime: true,
  hostedDeviceCatalog: [
    {
      edgeServerId: 'edge-alpha',
      deviceId: 'pump-1',
      deviceLabel: 'Pump 1',
      deviceType: 'pump',
      metrics: [{ key: 'temperature', label: 'temperature' }],
    },
  ],
  bindingsManager: { allDevices: [] },
  mapHostedCatalogToBindingsDevices: UIController.prototype.mapHostedCatalogToBindingsDevices,
}

await UIController.prototype.loadDevicesRegistry.call(hostedControllerContext)

if (fetchCalls > 0) {
  throw new Error('Hosted UIController path must not fetch devices-registry.json.')
}

if (!Array.isArray(hostedControllerContext.bindingsManager.allDevices)) {
  throw new Error('Hosted UIController path must keep bindingsManager.allDevices as an array.')
}

let layoutIntentCalls = 0
let bindingsIntentCalls = 0
let saveAsIntentCalls = 0
const hostedFileManager = new FileManager(null, null, null, null, null, null, {
  hostedRuntime: true,
  hostedCallbacks: {
    onSaveLayoutIntent: () => {
      layoutIntentCalls += 1
    },
    onSaveAsIntent: () => {
      saveAsIntentCalls += 1
    },
    onSaveBindingsIntent: () => {
      bindingsIntentCalls += 1
    },
  },
})

await hostedFileManager.saveScheme()
await hostedFileManager.saveBindings()
hostedFileManager.loadScheme()
hostedFileManager.loadBindings()

if (layoutIntentCalls !== 1) {
  throw new Error('Hosted saveScheme() should emit one onSaveLayoutIntent callback.')
}

if (bindingsIntentCalls !== 1) {
  throw new Error('Hosted saveBindings() should emit one onSaveBindingsIntent callback.')
}

if (saveAsIntentCalls !== 1) {
  throw new Error('Hosted loadScheme() should emit one onSaveAsIntent callback.')
}

globalThis.fetch = originalFetch

console.log('Hosted path bypasses constructor-owned fetch and browser save/load modals.')
