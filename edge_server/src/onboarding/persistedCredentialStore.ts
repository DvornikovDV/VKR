import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ENV } from '../config/env'

export type EdgeCredentialMode = 'onboarding' | 'persistent'
export type PersistedCredentialLifecycleState = 'Active'

export interface PersistedCredentialRecord {
  edgeId: string
  credentialMode: EdgeCredentialMode
  credentialSecret: string
  version: number | null
  issuedAt: string
  lifecycleState?: PersistedCredentialLifecycleState
}

export interface PersistedCredentialStore {
  load: () => Promise<PersistedCredentialRecord | null>
  save: (record: PersistedCredentialRecord) => Promise<void>
  clear: () => Promise<void>
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false
  return !Number.isNaN(Date.parse(value))
}

function isPersistedCredentialRecord(value: unknown): value is PersistedCredentialRecord {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  const credentialMode = candidate['credentialMode']
  const isOnboarding = credentialMode === 'onboarding'
  const isPersistent = credentialMode === 'persistent'

  if (!isOnboarding && !isPersistent) return false
  if (typeof candidate['edgeId'] !== 'string' || candidate['edgeId'].trim().length === 0) return false
  if (
    typeof candidate['credentialSecret'] !== 'string' ||
    candidate['credentialSecret'].trim().length === 0
  ) {
    return false
  }
  if (!isValidIsoDate(candidate['issuedAt'])) return false

  if (isOnboarding) {
    return candidate['version'] === null && candidate['lifecycleState'] === undefined
  }

  return (
    Number.isInteger(candidate['version']) &&
    Number(candidate['version']) > 0 &&
    (candidate['lifecycleState'] === undefined || candidate['lifecycleState'] === 'Active')
  )
}

async function ensureParentDir(filePath: string): Promise<void> {
  const parentDir = path.dirname(filePath)
  await mkdir(parentDir, { recursive: true })
}

export function createPersistedCredentialStore(
  filePath = ENV.EDGE_PERSISTED_CREDENTIAL_PATH,
): PersistedCredentialStore {
  const resolvedPath = path.resolve(filePath)

  return {
    async load() {
      try {
        const json = await readFile(resolvedPath, 'utf-8')
        const parsed = JSON.parse(json) as unknown

        if (!isPersistedCredentialRecord(parsed)) {
          throw new Error(`Invalid persisted credential format in ${resolvedPath}`)
        }

        return parsed
      } catch (error) {
        const errorWithCode = error as NodeJS.ErrnoException
        if (errorWithCode.code === 'ENOENT') {
          return null
        }
        throw error
      }
    },

    async save(record) {
      if (!isPersistedCredentialRecord(record)) {
        throw new Error('Invalid credential record payload')
      }

      await ensureParentDir(resolvedPath)
      await writeFile(resolvedPath, `${JSON.stringify(record, null, 2)}\n`, 'utf-8')
    },

    async clear() {
      try {
        await rm(resolvedPath, { force: true })
      } catch (error) {
        const errorWithCode = error as NodeJS.ErrnoException
        if (errorWithCode.code !== 'ENOENT') {
          throw error
        }
      }
    },
  }
}
