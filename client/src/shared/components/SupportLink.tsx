import type { ReactNode } from 'react'
import { buildSupportMailto, type SupportIntent } from '@/shared/config/support'

interface SupportLinkProps {
  children: ReactNode
  className?: string
  intent?: SupportIntent
  supportAddress?: string | null
  userEmail?: string | null
}

export function SupportLink({
  children,
  className,
  intent = 'general',
  supportAddress,
  userEmail,
}: SupportLinkProps) {
  const href = buildSupportMailto({
    address: supportAddress,
    intent,
    userEmail,
  })

  if (!href) {
    return null
  }

  return (
    <a href={href} className={className}>
      {children}
    </a>
  )
}
