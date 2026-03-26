import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ENV } from '../config/env'

export type EdgeCredentialMode = 'onboarding' | 'persistent'

export interface PersistedCredentialRecord {
  edgeId: string
  credentialMode: EdgeCredentialMode
  credentialSecret: string
  version: number | null
  issuedAt: string
}

export interface PersistedCredentialStore {
  load: () => Promise<PersistedCredentialRecord | null>
  save: (record: PersistedCredentialRecord) => Promise<void>
  clear: () => Promise<void>
}

function isPersistedCredentialRecord(value: unknown): value is PersistedCredentialRecord {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  const hasValidMode =
    candidate['credentialMode'] === 'onboarding' || candidate['credentialMode'] === 'persistent'

  return (
    typeof candidate['edgeId'] === 'string' &&
    candidate['edgeId'].trim().length > 0 &&
    hasValidMode &&
    typeof candidate['credentialSecret'] === 'string' &&
    candidate['credentialSecret'].trim().length > 0 &&
    (typeof candidate['version'] === 'number' || candidate['version'] === null) &&
    typeof candidate['issuedAt'] === 'string' &&
    candidate['issuedAt'].trim().length > 0
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
