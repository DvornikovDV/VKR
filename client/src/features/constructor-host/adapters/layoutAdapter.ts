import type { LayoutDocument } from '@/features/constructor-host/types'

const LAYOUT_ARRAY_SECTIONS = ['images', 'widgets', 'connectionPoints', 'connections'] as const

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue }

export class LayoutPayloadError extends Error {
  readonly _tag = 'LayoutPayloadError'
  readonly path: string

  constructor(message: string, path = 'layout') {
    super(message)
    this.name = 'LayoutPayloadError'
    this.path = path
  }
}

export function isLayoutPayloadError(error: unknown): error is LayoutPayloadError {
  return error instanceof LayoutPayloadError || (
    error instanceof Error &&
    '_tag' in error &&
    (error as { _tag?: string })._tag === 'LayoutPayloadError'
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function throwLayoutPayloadError(message: string, path = 'layout'): never {
  throw new LayoutPayloadError(message, path)
}

function assertJsonSerializable(value: unknown, path: string): asserts value is JsonValue {
  if (value === null) {
    return
  }

  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') {
    return
  }

  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throwLayoutPayloadError(`${path} must not contain NaN or Infinity values.`, path)
    }
    return
  }

  if (valueType === 'undefined' || valueType === 'function' || valueType === 'symbol' || valueType === 'bigint') {
    throwLayoutPayloadError(`${path} contains a non-serializable value (${valueType}).`, path)
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertJsonSerializable(item, `${path}[${index}]`)
    })
    return
  }

  if (!isPlainObject(value)) {
    throwLayoutPayloadError(
      `${path} contains a non-plain object. Only plain objects and arrays are allowed.`,
      path,
    )
  }

  for (const [entryKey, entryValue] of Object.entries(value)) {
    assertJsonSerializable(entryValue, `${path}.${entryKey}`)
  }
}

function validateArraySections(layout: Record<string, unknown>, sourceLabel: string) {
  for (const section of LAYOUT_ARRAY_SECTIONS) {
    const sectionValue = layout[section]
    if (typeof sectionValue !== 'undefined' && !Array.isArray(sectionValue)) {
      throwLayoutPayloadError(
        `${sourceLabel} layout payload has invalid "${section}" section. Expected an array.`,
        `layout.${section}`,
      )
    }
  }
}

function cloneLayout(layout: Record<string, unknown>): LayoutDocument {
  return JSON.parse(JSON.stringify(layout)) as LayoutDocument
}

function normalizeLayoutPayload(payload: unknown, sourceLabel: 'Import' | 'Export'): LayoutDocument {
  if (!isPlainObject(payload)) {
    throwLayoutPayloadError(`${sourceLabel} layout payload must be a plain object.`, 'layout')
  }

  validateArraySections(payload, sourceLabel)
  assertJsonSerializable(payload, 'layout')

  return cloneLayout(payload)
}

export function importLayoutPayload(payload: unknown): LayoutDocument {
  return normalizeLayoutPayload(payload, 'Import')
}

export function exportLayoutPayload(payload: unknown): LayoutDocument {
  return normalizeLayoutPayload(payload, 'Export')
}

