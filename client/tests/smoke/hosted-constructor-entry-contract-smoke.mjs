import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientRoot = path.resolve(__dirname, '..', '..')
const hostedEntryPath = path.join(clientRoot, 'dist', 'constructor', 'hosted-entry.js')

if (!existsSync(hostedEntryPath)) {
  throw new Error(`Missing hosted constructor entry: ${hostedEntryPath}`)
}

const moduleUrl = `${pathToFileURL(hostedEntryPath).href}?t=${Date.now()}`
const hostedModule = await import(moduleUrl)

if (typeof hostedModule.createHostedConstructor !== 'function') {
  throw new Error('Hosted entry does not export createHostedConstructor(config).')
}

let hasContainerValidationError = false

try {
  await hostedModule.createHostedConstructor({})
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  hasContainerValidationError = /container/i.test(message)
}

if (!hasContainerValidationError) {
  throw new Error('Hosted bootstrap should validate the mount container.')
}

console.log('Hosted entry exports stable createHostedConstructor(config) bootstrap.')
