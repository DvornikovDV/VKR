import { Suspense, lazy } from 'react'
import { type RouteObject } from 'react-router-dom'
import { GalleryPage } from '@/features/user-hub/pages/GalleryPage'
import { UserHubLayout } from '@/features/user-hub/UserHubLayout'

const FullConstructorPage = lazy(async () => {
  const module = await import('@/features/user-hub/pages/FullConstructorPage')
  return { default: module.FullConstructorPage }
})

function UserHubPlaceholder({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100svh',
        gap: '0.75rem',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <span style={{ fontSize: '2rem' }}>*</span>
      <h2 style={{ margin: 0, fontSize: '1rem', color: '#e2e8f0' }}>{label}</h2>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
        Wired in Phase 4-8 - coming soon
      </p>
    </div>
  )
}

export const userHubRouteChildren: RouteObject[] = [
  {
    element: <UserHubLayout />,
    children: [
      {
        index: true,
        element: <GalleryPage />,
      },
      {
        path: 'editor/:id',
        element: (
          <Suspense
            fallback={
              <div className="flex min-h-[18rem] flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--color-surface-border)] text-sm text-[#94a3b8]">
                Loading hosted constructor page...
              </div>
            }
          >
            <FullConstructorPage />
          </Suspense>
        ),
      },
      {
        path: '*',
        element: <UserHubPlaceholder label="User Hub - Page (Phase 4-8)" />,
      },
    ],
  },
]
