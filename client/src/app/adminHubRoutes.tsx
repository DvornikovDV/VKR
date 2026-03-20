import { Suspense, lazy } from 'react'
import { type RouteObject } from 'react-router-dom'
import { AdminHubLayout } from '@/features/admin-hub/AdminHubLayout'
import { DiagramGalleryPage } from '@/features/admin-hub/pages/DiagramGalleryPage'
import { EdgeFleetPage } from '@/features/admin-hub/pages/EdgeFleetPage'
import { OverviewPage } from '@/features/admin-hub/pages/OverviewPage'
import { UserManagementPage } from '@/features/admin-hub/pages/UserManagementPage'

const ReducedConstructorPage = lazy(async () => {
  const module = await import('@/features/admin-hub/pages/ReducedConstructorPage')
  return { default: module.ReducedConstructorPage }
})

function AdminHubPlaceholder({ label }: { label: string }) {
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
        Wired in Phase 5-8 - coming soon
      </p>
    </div>
  )
}

export const adminHubRouteChildren: RouteObject[] = [
  {
    element: <AdminHubLayout />,
    children: [
      {
        index: true,
        element: <OverviewPage />,
      },
      {
        path: 'edge',
        element: <EdgeFleetPage />,
      },
      {
        path: 'users',
        element: <UserManagementPage />,
      },
      {
        path: 'diagrams',
        element: <DiagramGalleryPage />,
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
            <ReducedConstructorPage />
          </Suspense>
        ),
      },
      {
        path: '*',
        element: <AdminHubPlaceholder label="Admin Hub - Page (Phase 5-8)" />,
      },
    ],
  },
]
