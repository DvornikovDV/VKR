export type SupportIntent = 'general' | 'diagram-request'

interface SupportMailtoOptions {
  address?: string | null
  intent?: SupportIntent
  userEmail?: string | null
}

function normalizeSupportEmail(value: string | undefined | null): string | null {
  const trimmed = value?.trim() ?? ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null
}

export const supportEmail = normalizeSupportEmail(
  import.meta.env.VITE_SUPPORT_EMAIL as string | undefined,
)

export function buildSupportMailto({
  address = supportEmail,
  intent = 'general',
  userEmail,
}: SupportMailtoOptions = {}): string | null {
  const normalizedAddress = normalizeSupportEmail(address)
  if (!normalizedAddress) {
    return null
  }

  const normalizedUserEmail = normalizeSupportEmail(userEmail)
  const subject =
    intent === 'diagram-request'
      ? 'Запрос мнемосхемы'
      : 'Обращение в поддержку VKR SCADA'
  const bodyLines =
    intent === 'diagram-request'
      ? [
          ...(normalizedUserEmail ? [`Пользователь: ${normalizedUserEmail}`, ''] : []),
          'Опишите требуемую мнемосхему и её назначение:',
        ]
      : [
          ...(normalizedUserEmail ? [`Пользователь: ${normalizedUserEmail}`, ''] : []),
          'Опишите вопрос:',
        ]

  return `mailto:${normalizedAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`
}
