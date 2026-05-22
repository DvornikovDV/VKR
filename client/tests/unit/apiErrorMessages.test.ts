import { describe, expect, it } from 'vitest'
import { createApiError } from '@/shared/api/client'
import {
  getErrorDisplayMessage,
  getMappedApiErrorMessage,
  getMappedKnownErrorMessage,
} from '@/shared/api/errorMessages'

describe('api error display messages', () => {
  it('maps command failure reasons without changing backend contract values', () => {
    const error = createApiError(504, 'Cloud RPC timeout', {
      status: 'error',
      message: 'Cloud RPC timeout: Edge did not respond within the allowed window',
      failureReason: 'cloud_rpc_timeout',
    })

    expect(getMappedApiErrorMessage(error)).toBe('Таймаут RPC в облаке.')
  })

  it('maps nested error codes from response data envelopes', () => {
    const error = createApiError(409, 'Email already registered', {
      status: 'error',
      data: {
        code: 'email_already_exists',
      },
    })

    expect(getMappedApiErrorMessage(error)).toBe('Аккаунт с таким email уже существует.')
  })

  it('maps known English backend messages before status fallbacks', () => {
    const error = createApiError(401, 'Account has been suspended', {
      status: 'error',
      message: 'Account has been suspended',
    })

    expect(getMappedApiErrorMessage(error)).toBe('Аккаунт заблокирован. Обратитесь в поддержку.')
  })

  it('uses status fallbacks for unknown API messages', () => {
    const error = createApiError(403, 'Access is blocked by policy', {
      status: 'error',
      message: 'Access is blocked by policy',
    })

    expect(getErrorDisplayMessage(error, 'Fallback')).toBe('Недостаточно прав для выполнения действия.')
  })

  it('preserves non-API local errors after known-message mapping', () => {
    expect(getMappedKnownErrorMessage('Version conflict - stale revision')).toBe(
      'Данные были изменены. Обновите страницу и повторите действие.',
    )
    expect(getErrorDisplayMessage(new Error('Runtime конструктора еще не готов.'), 'Fallback')).toBe(
      'Runtime конструктора еще не готов.',
    )
  })
})
