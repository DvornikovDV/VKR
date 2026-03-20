import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientRoot = path.resolve(__dirname, '..', '..')
const repoRoot = path.resolve(clientRoot, '..')
const constructorPublicDir = path.join(repoRoot, 'constructor', 'public')

const constructorHostedEntryPath = path.join(constructorPublicDir, 'hosted-entry.js')
const constructorStandaloneIndexPath = path.join(constructorPublicDir, 'index.html')

if (!existsSync(constructorHostedEntryPath)) {
  throw new Error(`Missing constructor hosted entry source: ${constructorHostedEntryPath}`)
}

if (!existsSync(constructorStandaloneIndexPath)) {
  throw new Error(
    `Expected legacy standalone artifact for compatibility check: ${constructorStandaloneIndexPath}`,
  )
}

const DEV_SERVER_HOST = '127.0.0.1'
const DEV_SERVER_PORT = 4175
const devServerBaseUrl = `http://${DEV_SERVER_HOST}:${DEV_SERVER_PORT}`

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForHostedEntryResponse(timeoutMs) {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`${devServerBaseUrl}/constructor/hosted-entry.js`)
      if (response.ok) {
        return response
      }
    } catch {
      // Dev server is still starting.
    }

    await sleep(150)
  }

  throw new Error(
    `Timed out waiting for Vite dev server to serve /constructor/hosted-entry.js at ${devServerBaseUrl}.`,
  )
}

const viteDevProcess = spawn(
  'cmd.exe',
  [
    '/d',
    '/s',
    '/c',
    `npx.cmd vite --host ${DEV_SERVER_HOST} --port ${DEV_SERVER_PORT} --strictPort --configLoader native --logLevel error`,
  ],
  {
    cwd: clientRoot,
    stdio: 'ignore',
    windowsHide: true,
  },
)

try {
  const hostedEntryResponse = await waitForHostedEntryResponse(15000)
  const servedHostedEntry = await hostedEntryResponse.text()
  const sourceHostedEntry = readFileSync(constructorHostedEntryPath, 'utf8')

  if (servedHostedEntry !== sourceHostedEntry) {
    throw new Error(
      'Dev hosted asset is not served directly from constructor/public/hosted-entry.js.',
    )
  }
} finally {
  if (!viteDevProcess.killed) {
    viteDevProcess.kill()
  }
}

const distHostedEntryPath = path.join(clientRoot, 'dist', 'constructor', 'hosted-entry.js')
const distStylesPath = path.join(clientRoot, 'dist', 'constructor', 'styles.css')
const distStandaloneIndexPath = path.join(clientRoot, 'dist', 'constructor', 'index.html')

if (!existsSync(distHostedEntryPath)) {
  throw new Error(`Missing build hosted entry output: ${distHostedEntryPath}`)
}

if (!existsSync(distStylesPath)) {
  throw new Error(`Missing build hosted styles output: ${distStylesPath}`)
}

if (existsSync(distStandaloneIndexPath)) {
  throw new Error(
    'Standalone constructor index.html should not be emitted into dist/constructor for hosted delivery.',
  )
}

console.log('Unified hosted pipeline validated for dev and build outputs.')
