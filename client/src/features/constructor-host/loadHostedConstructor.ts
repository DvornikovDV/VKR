import { HOSTED_CONSTRUCTOR_ENTRY_PATH } from './runtimePaths'
import type { HostedConstructorModule } from './types'

export type HostedConstructorImporter = (moduleUrl: string) => Promise<unknown>

export interface LoadHostedConstructorOptions {
  forceReload?: boolean
  importer?: HostedConstructorImporter
}

let hostedConstructorModulePromise: Promise<HostedConstructorModule> | null = null

function assertBrowserEnvironment(): void {
  if (typeof window === 'undefined') {
    throw new Error('Hosted constructor runtime can only be loaded in browser environment.')
  }
}

function resolveHostedConstructorEntryUrl(): string {
  assertBrowserEnvironment()

  const entryUrl = new URL(HOSTED_CONSTRUCTOR_ENTRY_PATH, window.location.origin)
  if (entryUrl.origin !== window.location.origin) {
    throw new Error(`Hosted constructor entry must be same-origin: ${entryUrl.toString()}`)
  }

  return entryUrl.toString()
}

async function defaultHostedConstructorImporter(moduleUrl: string): Promise<unknown> {
  return import(/* @vite-ignore */ moduleUrl)
}

function isHostedConstructorModule(value: unknown): value is HostedConstructorModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as HostedConstructorModule).createHostedConstructor === 'function'
  )
}

async function loadHostedConstructorModule(importer: HostedConstructorImporter): Promise<HostedConstructorModule> {
  const moduleUrl = resolveHostedConstructorEntryUrl()
  const loadedModule = await importer(moduleUrl)

  if (!isHostedConstructorModule(loadedModule)) {
    throw new Error(
      `Hosted constructor entry "${HOSTED_CONSTRUCTOR_ENTRY_PATH}" does not export createHostedConstructor().`,
    )
  }

  return loadedModule
}

export async function loadHostedConstructor(
  options: LoadHostedConstructorOptions = {},
): Promise<HostedConstructorModule> {
  const { forceReload = false, importer = defaultHostedConstructorImporter } = options

  if (forceReload) {
    hostedConstructorModulePromise = null
  }

  if (!hostedConstructorModulePromise) {
    hostedConstructorModulePromise = loadHostedConstructorModule(importer)
  }

  try {
    return await hostedConstructorModulePromise
  } catch (error) {
    hostedConstructorModulePromise = null
    throw error
  }
}

export function resetHostedConstructorLoaderForTests(): void {
  hostedConstructorModulePromise = null
}
