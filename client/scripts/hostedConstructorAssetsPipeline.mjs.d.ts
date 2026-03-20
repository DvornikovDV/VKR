export interface HostedConstructorAssetFile {
  absolutePath: string
  relativePath: string
}

export const CONSTRUCTOR_PUBLIC_SOURCE_DIR: string
export const LEGACY_HOSTED_CONSTRUCTOR_STAGING_DIR: string

export function ensureHostedConstructorSourceDir(): void
export function cleanLegacyHostedConstructorStagingDir(): void
export function listHostedConstructorAssetFiles(): HostedConstructorAssetFile[]
export function resolveHostedConstructorSourceFile(relativeAssetPath: string): string | null
