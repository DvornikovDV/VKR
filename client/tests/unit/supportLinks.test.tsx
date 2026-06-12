import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SupportLink } from '@/shared/components/SupportLink'
import { buildSupportMailto } from '@/shared/config/support'

describe('support links', () => {
  it('does not expose a link when support email is not configured', () => {
    render(<SupportLink supportAddress={null}>Связаться с поддержкой</SupportLink>)

    expect(screen.queryByRole('link', { name: 'Связаться с поддержкой' })).not.toBeInTheDocument()
  })

  it('builds a diagram request with the authenticated user context', () => {
    const href = buildSupportMailto({
      address: 'support@example.com',
      intent: 'diagram-request',
      userEmail: 'user@example.com',
    })

    expect(href).not.toBeNull()
    expect(decodeURIComponent(href ?? '')).toContain('subject=Запрос мнемосхемы')
    expect(decodeURIComponent(href ?? '')).toContain('Пользователь: user@example.com')
    expect(decodeURIComponent(href ?? '')).toContain('Опишите требуемую мнемосхему')
  })

  it('renders a configured mailto link', () => {
    render(
      <SupportLink supportAddress="support@example.com">
        Связаться с поддержкой
      </SupportLink>,
    )

    expect(screen.getByRole('link', { name: 'Связаться с поддержкой' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:support@example.com'),
    )
  })
})
