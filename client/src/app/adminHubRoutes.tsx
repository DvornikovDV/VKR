import { Suspense, lazy } from 'react'
import { type RouteObject } from 'react-router-dom'
import { renderLazyRoute } from '@/app/lazyRoute'

const AdminHubLayout = lazy(async () => {
  const module = await import('@/features/admin-hub/AdminHubLayout')
  return { default: module.AdminHubLayout }
})

const DiagramGalleryPage = lazy(async () => {
  const module = await import('@/features/admin-hub/pages/DiagramGalleryPage')
  return { default: module.DiagramGalleryPage }
})

const EdgeFleetPage = lazy(async () => {
  const module = await import('@/features/admin-hub/pages/EdgeFleetPage')
  return { default: module.EdgeFleetPage }
})

const OverviewPage = lazy(async () => {
  const module = await import('@/features/admin-hub/pages/OverviewPage')
  return { default: module.OverviewPage }
})

const UserManagementPage = lazy(async () => {
  const module = await import('@/features/admin-hub/pages/UserManagementPage')
  return { default: module.UserManagementPage }
})

const ReducedConstructorPage = lazy(async () => {
  const module = await import('@/features/admin-hub/pages/ReducedConstructorPage')
  return { default: module.ReducedConstructorPage }
})

const adminHubPlaceholderElement = (
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
    <h2 style={{ margin: 0, fontSize: '1rem', color: '#e2e8f0' }}>Admin Hub - Page (Phase 5-8)</h2>
    <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
      Wired in Phase 5-8 - coming soon
    </p>
  </div>
)

export const adminHubRouteChildren: RouteObject[] = [
  {
    element: renderLazyRoute(AdminHubLayout, 'Loading admin hub...'),
    children: [
      {
        index: true,
        element: renderLazyRoute(OverviewPage, 'Loading overview...'),
      },
      {
        path: 'edge',
        element: renderLazyRoute(EdgeFleetPage, 'Loading edge fleet...'),
      },
      {
        path: 'users',
        element: renderLazyRoute(UserManagementPage, 'Loading user management...'),
      },
      {
        path: 'diagrams',
        element: renderLazyRoute(DiagramGalleryPage, 'Loading diagram gallery...'),
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
        element: adminHubPlaceholderElement,
      },
    ],
  },
]
