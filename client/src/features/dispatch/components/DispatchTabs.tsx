import { NavLink, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  DISPATCH_TAB_ROUTES,
  type DispatchTabId,
} from '@/features/dispatch/model/routes'

interface DispatchTabsProps {
  activeTabId: DispatchTabId
  search?: string | URLSearchParams
  disabled?: boolean
  className?: string
}

function normalizeSearch(search: string | URLSearchParams): string {
  const searchValue = typeof search === 'string' ? search : search.toString()
  const trimmedSearch = searchValue.trim()

  if (!trimmedSearch) {
    return ''
  }

  return trimmedSearch.startsWith('?') ? trimmedSearch : `?${trimmedSearch}`
}

export function DispatchTabs({
  activeTabId,
  search,
  disabled = false,
  className,
}: DispatchTabsProps) {
  const location = useLocation()
  const tabSearch = normalizeSearch(search ?? location.search)

  return (
    <nav aria-label="Dispatch tabs" className={className}>
      <div
        role="tablist"
        aria-label="Dispatch tabs"
        className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-[#1f2a3d] bg-[#08111f] px-3 pt-2"
      >
        {DISPATCH_TAB_ROUTES.map((route) => {
          const isActive = route.id === activeTabId

          return (
            <NavLink
              key={route.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              to={`${route.path}${tabSearch}`}
              onClick={(event) => {
                if (disabled) {
                  event.preventDefault()
                }
              }}
              className={clsx(
                'shrink-0 rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'border-[#334155] bg-[#0a1220] text-white'
                  : 'border-transparent text-[#94a3b8] hover:bg-[#0f172a] hover:text-white',
                disabled ? 'pointer-events-none opacity-60' : null,
              )}
            >
              {route.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
