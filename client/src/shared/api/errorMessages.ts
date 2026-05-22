import { isApiError } from './client'

const API_ERROR_CODE_MESSAGES: Record<string, string> = {
  account_banned: 'Аккаунт заблокирован. Обратитесь в поддержку.',
  account_blocked: 'Аккаунт заблокирован. Обратитесь в поддержку.',
  account_suspended: 'Аккаунт заблокирован. Обратитесь в поддержку.',
  bad_request: 'Проверьте введенные данные.',
  blocked: 'Доступ заблокирован.',
  cloud_rpc_timeout: 'Таймаут RPC в облаке.',
  conflict: 'Данные были изменены. Обновите страницу и повторите действие.',
  duplicate_email: 'Аккаунт с таким email уже существует.',
  edge_command_failed: 'Команда объекта завершилась ошибкой.',
  edge_command_timeout: 'Таймаут команды объекта.',
  edge_not_found: 'Объект не найден.',
  edge_unavailable: 'Объект недоступен.',
  email_already_exists: 'Аккаунт с таким email уже существует.',
  email_exists: 'Аккаунт с таким email уже существует.',
  forbidden: 'Недостаточно прав для выполнения действия.',
  invalid_credentials: 'Неверный email или пароль.',
  invalid_credential: 'Недействительный ключ объекта.',
  invalid_request: 'Проверьте введенные данные.',
  network_error: 'Ошибка соединения. Проверьте сеть.',
  not_found: 'Запрошенные данные не найдены.',
  unauthorized: 'Требуется повторный вход.',
  unknown_error: 'Неизвестная ошибка.',
  user_banned: 'Аккаунт заблокирован. Обратитесь в поддержку.',
  user_blocked: 'Аккаунт заблокирован. Обратитесь в поддержку.',
  user_exists: 'Аккаунт с таким email уже существует.',
  validation_error: 'Проверьте введенные данные.',
  version_conflict: 'Данные были изменены. Обновите страницу и повторите действие.',
}

const API_ERROR_STATUS_MESSAGES: Record<number, string> = {
  400: 'Проверьте введенные данные.',
  401: 'Требуется повторный вход.',
  403: 'Недостаточно прав для выполнения действия.',
  404: 'Запрошенные данные не найдены.',
  409: 'Данные были изменены. Обновите страницу и повторите действие.',
  413: 'Размер запроса слишком большой.',
  429: 'Слишком много запросов. Попробуйте позже.',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase()
}

function getMappedCodeMessage(value: string | null): string | null {
  if (!value) {
    return null
  }

  return API_ERROR_CODE_MESSAGES[normalizeCode(value)] ?? null
}

function collectErrorCodes(body: unknown): string[] {
  if (!isRecord(body)) {
    return []
  }

  const candidates = [
    body.code,
    body.errorCode,
    body.failureReason,
  ]

  if (isRecord(body.data)) {
    candidates.push(body.data.code, body.data.errorCode, body.data.failureReason)
  }

  return candidates
    .map((candidate) => toNonEmptyString(candidate))
    .filter((candidate): candidate is string => candidate !== null)
}

function readErrorMessage(body: unknown): string | null {
  if (!isRecord(body)) {
    return null
  }

  const directMessage = toNonEmptyString(body.message)
  if (directMessage) {
    return directMessage
  }

  return isRecord(body.data) ? toNonEmptyString(body.data.message) : null
}

export function getMappedApiErrorMessage(error: unknown): string | null {
  if (!isApiError(error)) {
    return null
  }

  for (const code of collectErrorCodes(error.body)) {
    const codeMessage = getMappedCodeMessage(code)
    if (codeMessage) {
      return codeMessage
    }
  }

  const bodyMessage = readErrorMessage(error.body) ?? error.message
  const knownMessage = getMappedKnownErrorMessage(bodyMessage)
  if (knownMessage) {
    return knownMessage
  }

  if (error.status >= 500) {
    return 'Ошибка сервера. Попробуйте позже.'
  }

  return API_ERROR_STATUS_MESSAGES[error.status] ?? null
}

export function getMappedKnownErrorMessage(message: string): string | null {
  const normalized = message.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized.includes('cloud rpc timeout')) {
    return API_ERROR_CODE_MESSAGES.cloud_rpc_timeout
  }

  if (normalized.includes('edge command timeout')) {
    return API_ERROR_CODE_MESSAGES.edge_command_timeout
  }

  if (normalized.includes('edge command failed')) {
    return API_ERROR_CODE_MESSAGES.edge_command_failed
  }

  if (
    normalized.includes('edge unavailable') ||
    normalized.includes('no active trusted edge socket')
  ) {
    return API_ERROR_CODE_MESSAGES.edge_unavailable
  }

  if (
    normalized.includes('account has been suspended') ||
    normalized.includes('account has been deactivated') ||
    normalized.includes('account has been banned') ||
    normalized.includes('user banned')
  ) {
    return API_ERROR_CODE_MESSAGES.account_banned
  }

  if (
    normalized.includes('invalid credentials') ||
    normalized.includes('invalid email or password')
  ) {
    return API_ERROR_CODE_MESSAGES.invalid_credentials
  }

  if (
    normalized.includes('email already registered') ||
    (normalized.includes('email') && normalized.includes('already exists'))
  ) {
    return API_ERROR_CODE_MESSAGES.email_exists
  }

  if (normalized.includes('version conflict')) {
    return API_ERROR_CODE_MESSAGES.version_conflict
  }

  if (normalized.includes('request body is too large')) {
    return API_ERROR_STATUS_MESSAGES[413]
  }

  if (normalized.includes('too many')) {
    return API_ERROR_STATUS_MESSAGES[429]
  }

  if (normalized.includes('forbidden') || normalized.includes('access denied')) {
    return API_ERROR_CODE_MESSAGES.forbidden
  }

  if (
    normalized.includes('unauthorized') ||
    normalized.includes('not authenticated') ||
    normalized.includes('jwt') ||
    normalized.includes('token')
  ) {
    return API_ERROR_CODE_MESSAGES.unauthorized
  }

  if (normalized.includes('not found')) {
    return API_ERROR_CODE_MESSAGES.not_found
  }

  if (
    normalized.includes('validation') ||
    normalized.includes('invalid request') ||
    normalized.includes('bad request') ||
    normalized.includes('required strings')
  ) {
    return API_ERROR_CODE_MESSAGES.validation_error
  }

  return null
}

export function getErrorDisplayMessage(error: unknown, fallback: string): string {
  const apiMessage = getMappedApiErrorMessage(error)
  if (apiMessage) {
    return apiMessage
  }

  if (error instanceof TypeError) {
    return API_ERROR_CODE_MESSAGES.network_error
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return getMappedKnownErrorMessage(error.message) ?? error.message
  }

  return fallback
}
