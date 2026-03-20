import type { EditorMode } from './types'

export const HOSTED_CONSTRUCTOR_USER_ROUTE_PATTERN = '/hub/editor/:id'
export const HOSTED_CONSTRUCTOR_ADMIN_ROUTE_PATTERN = '/admin/editor/:id'

export const HOSTED_CONSTRUCTOR_PUBLIC_BASE_PATH = '/constructor'
export const HOSTED_CONSTRUCTOR_ENTRY_FILE = 'hosted-entry.js'
export const HOSTED_CONSTRUCTOR_STYLES_FILE = 'styles.css'

export function buildHostedConstructorPublicAssetPath(relativePath: string): string {
  const normalizedRelativePath = relativePath.replace(/^\/+/, '')
  return `${HOSTED_CONSTRUCTOR_PUBLIC_BASE_PATH}/${normalizedRelativePath}`
}

export const HOSTED_CONSTRUCTOR_ENTRY_PATH = buildHostedConstructorPublicAssetPath(
  HOSTED_CONSTRUCTOR_ENTRY_FILE,
)
export const HOSTED_CONSTRUCTOR_STYLES_PATH = buildHostedConstructorPublicAssetPath(
  HOSTED_CONSTRUCTOR_STYLES_FILE,
)

export function getHostedConstructorRoutePattern(mode: EditorMode): string {
  return mode === 'full'
    ? HOSTED_CONSTRUCTOR_USER_ROUTE_PATTERN
    : HOSTED_CONSTRUCTOR_ADMIN_ROUTE_PATTERN
}

export function getHostedConstructorRoutePath(mode: EditorMode, diagramId: string): string {
  const encodedDiagramId = encodeURIComponent(diagramId)
  return mode === 'full' ? `/hub/editor/${encodedDiagramId}` : `/admin/editor/${encodedDiagramId}`
}
