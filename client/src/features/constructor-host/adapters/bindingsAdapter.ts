import type { WidgetBindingRecord } from '@/features/constructor-host/types'

export interface DiagramBindingSetRecord {
  _id?: string
  diagramId?: string
  edgeServerId: string
  widgetBindings: WidgetBindingRecord[]
  createdAt?: string
  updatedAt?: string
}

export interface BindingSetsImportRecoveryResult {
  bindingSets: DiagramBindingSetRecord[]
  recoveryError: BindingsPayloadError | null
}

export class BindingsPayloadError extends Error {
  readonly _tag = 'BindingsPayloadError'
  readonly path: string

  constructor(message: string, path = 'bindings') {
    super(message)
    this.name = 'BindingsPayloadError'
    this.path = path
  }
}

export function isBindingsPayloadError(error: unknown): error is BindingsPayloadError {
  return error instanceof BindingsPayloadError || (
    error instanceof Error &&
    '_tag' in error &&
    (error as { _tag?: string })._tag === 'BindingsPayloadError'
  )
}

function throwBindingsPayloadError(message: string, path = 'bindings'): never {
  throw new BindingsPayloadError(message, path)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function asNonEmptyString(value: unknown, path: string, label: string): string {
  if (typeof value !== 'string') {
    throwBindingsPayloadError(`${label} must be a string.`, path)
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throwBindingsPayloadError(`${label} must not be empty.`, path)
  }

  return trimmed
}

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeWidgetBinding(binding: unknown, path: string): WidgetBindingRecord {
  if (!isPlainObject(binding)) {
    throwBindingsPayloadError('Widget binding entry must be a plain object.', path)
  }

  return {
    widgetId: asNonEmptyString(binding.widgetId, `${path}.widgetId`, 'widgetId'),
    deviceId: asNonEmptyString(binding.deviceId, `${path}.deviceId`, 'deviceId'),
    metric: asNonEmptyString(binding.metric, `${path}.metric`, 'metric'),
  }
}

function normalizeBindingSet(bindingSet: unknown, index: number): DiagramBindingSetRecord {
  const path = `bindings[${index}]`
  if (!isPlainObject(bindingSet)) {
    throwBindingsPayloadError('Binding set entry must be a plain object.', path)
  }

  if (!Array.isArray(bindingSet.widgetBindings)) {
    throwBindingsPayloadError('Binding set must contain widgetBindings array.', `${path}.widgetBindings`)
  }

  const normalized: DiagramBindingSetRecord = {
    edgeServerId: asNonEmptyString(bindingSet.edgeServerId, `${path}.edgeServerId`, 'edgeServerId'),
    widgetBindings: bindingSet.widgetBindings.map((entry, bindingIndex) =>
      normalizeWidgetBinding(entry, `${path}.widgetBindings[${bindingIndex}]`),
    ),
  }

  if (typeof bindingSet._id !== 'undefined') {
    normalized._id = asNonEmptyString(bindingSet._id, `${path}._id`, '_id')
  }

  if (typeof bindingSet.diagramId !== 'undefined') {
    normalized.diagramId = asNonEmptyString(bindingSet.diagramId, `${path}.diagramId`, 'diagramId')
  }

  if (typeof bindingSet.createdAt !== 'undefined') {
    normalized.createdAt = asNonEmptyString(bindingSet.createdAt, `${path}.createdAt`, 'createdAt')
  }

  if (typeof bindingSet.updatedAt !== 'undefined') {
    normalized.updatedAt = asNonEmptyString(bindingSet.updatedAt, `${path}.updatedAt`, 'updatedAt')
  }

  return normalized
}

function normalizeWidgetBindings(payload: unknown, sourceLabel: 'Import' | 'Export'): WidgetBindingRecord[] {
  if (!Array.isArray(payload)) {
    throwBindingsPayloadError(`${sourceLabel} bindings payload must be an array.`, 'bindings')
  }

  const normalizedBindings = payload.map((entry, index) =>
    normalizeWidgetBinding(entry, `bindings[${index}]`),
  )

  return cloneSerializable(normalizedBindings)
}

export function importWidgetBindingsPayload(payload: unknown): WidgetBindingRecord[] {
  return normalizeWidgetBindings(payload, 'Import')
}

export function exportWidgetBindingsPayload(payload: unknown): WidgetBindingRecord[] {
  return normalizeWidgetBindings(payload, 'Export')
}

export function importBindingSetsPayload(payload: unknown): DiagramBindingSetRecord[] {
  if (!Array.isArray(payload)) {
    throwBindingsPayloadError('Import binding sets payload must be an array.', 'bindings')
  }

  const normalizedBindingSets = payload.map((entry, index) => normalizeBindingSet(entry, index))
  return cloneSerializable(normalizedBindingSets)
}

export function importBindingSetsPayloadWithRecovery(
  payload: unknown,
): BindingSetsImportRecoveryResult {
  if (!Array.isArray(payload)) {
    return {
      bindingSets: [],
      recoveryError: new BindingsPayloadError('Import binding sets payload must be an array.', 'bindings'),
    }
  }

  const recovered: DiagramBindingSetRecord[] = []
  let invalidEntries = 0
  let firstInvalidError: BindingsPayloadError | null = null

  payload.forEach((entry, index) => {
    try {
      recovered.push(normalizeBindingSet(entry, index))
    } catch (error) {
      if (!isBindingsPayloadError(error)) {
        throw error
      }

      invalidEntries += 1
      if (!firstInvalidError) {
        firstInvalidError = error
      }
    }
  })

  if (!firstInvalidError) {
    return {
      bindingSets: cloneSerializable(recovered),
      recoveryError: null,
    }
  }

  const recoveredCount = recovered.length
  const totalCount = payload.length
  const detail = `${invalidEntries} invalid entr${invalidEntries === 1 ? 'y' : 'ies'} skipped, ${recoveredCount}/${totalCount} kept.`
  const recoveryBaseError: BindingsPayloadError = firstInvalidError

  return {
    bindingSets: cloneSerializable(recovered),
    recoveryError: new BindingsPayloadError(
      `${recoveryBaseError.message} ${detail}`,
      recoveryBaseError.path,
    ),
  }
}

export function findBindingSetForEdgeServer(
  bindingSets: DiagramBindingSetRecord[],
  edgeServerId: string | null | undefined,
): DiagramBindingSetRecord | null {
  if (!edgeServerId) {
    return null
  }

  return bindingSets.find((bindingSet) => bindingSet.edgeServerId === edgeServerId) ?? null
}
