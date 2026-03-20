import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientRoot = path.resolve(__dirname, '..')

// Single editable source of truth for hosted constructor runtime assets.
export const CONSTRUCTOR_PUBLIC_SOURCE_DIR = path.resolve(clientRoot, '..', 'constructor', 'public')
// Legacy generated staging path under /client. Keep ignored by git and never edit manually.
export const LEGACY_HOSTED_CONSTRUCTOR_STAGING_DIR = path.resolve(
  clientRoot,
  'public',
  'constructor',
)

const EXCLUDED_HOSTED_FILES = new Set(['index.html', 'note.md'])

function shouldExcludeHostedFile(fileName) {
  return EXCLUDED_HOSTED_FILES.has(fileName.toLowerCase())
}

function toPosixPath(pathValue) {
  return pathValue.replace(/\\/g, '/')
}

export function ensureHostedConstructorSourceDir() {
  if (!existsSync(CONSTRUCTOR_PUBLIC_SOURCE_DIR)) {
    throw new Error(
      `Constructor public directory not found: ${CONSTRUCTOR_PUBLIC_SOURCE_DIR}`,
    )
  }
}

export function cleanLegacyHostedConstructorStagingDir() {
  rmSync(LEGACY_HOSTED_CONSTRUCTOR_STAGING_DIR, { recursive: true, force: true })
}

function collectHostedAssets(currentDir, sourceRoot, files) {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      collectHostedAssets(path.join(currentDir, entry.name), sourceRoot, files)
      continue
    }

    if (shouldExcludeHostedFile(entry.name)) {
      continue
    }

    const absolutePath = path.join(currentDir, entry.name)
    const relativePath = toPosixPath(path.relative(sourceRoot, absolutePath))
    files.push({ absolutePath, relativePath })
  }
}

export function listHostedConstructorAssetFiles() {
  ensureHostedConstructorSourceDir()

  const files = []
  collectHostedAssets(CONSTRUCTOR_PUBLIC_SOURCE_DIR, CONSTRUCTOR_PUBLIC_SOURCE_DIR, files)
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
}

export function resolveHostedConstructorSourceFile(relativeAssetPath) {
  ensureHostedConstructorSourceDir()

  const normalizedRelativePath = relativeAssetPath.replace(/^[/\\]+/, '')
  if (!normalizedRelativePath) {
    return null
  }

  const absolutePath = path.resolve(CONSTRUCTOR_PUBLIC_SOURCE_DIR, normalizedRelativePath)
  const relativeToSourceRoot = path.relative(CONSTRUCTOR_PUBLIC_SOURCE_DIR, absolutePath)

  if (relativeToSourceRoot.startsWith('..') || path.isAbsolute(relativeToSourceRoot)) {
    return null
  }

  if (shouldExcludeHostedFile(path.basename(absolutePath))) {
    return null
  }

  if (!existsSync(absolutePath) || statSync(absolutePath).isDirectory()) {
    return null
  }

  return absolutePath
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  cleanLegacyHostedConstructorStagingDir()
}
