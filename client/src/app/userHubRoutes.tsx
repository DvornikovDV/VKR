import { Suspense, lazy } from 'react'
import { Navigate, useLocation, type RouteObject } from 'react-router-dom'
import { renderLazyRoute } from '@/app/lazyRoute'
import { UserHubLayout } from '@/features/user-hub/UserHubLayout'
import { userHubEquipmentRoute } from '@/features/user-hub/routes/userHubEquipmentRoute'
import { DISPATCH_DEFAULT_PATH } from '@/features/dispatch/model/routes'

const GalleryPage = lazy(async () => {
  const module = await import('@/features/user-hub/pages/GalleryPage')
  return { default: module.GalleryPage }
})

const DispatchWorkspacePage = lazy(async () => {
  const module = await import('@/features/dispatch/pages/DispatchWorkspacePage')
  return { default: module.DispatchWorkspacePage }
})

const ProfilePage = lazy(async () => {
  const module = await import('@/features/user-hub/pages/ProfilePage')
  return { default: module.ProfilePage }
})

const FullConstructorPage = lazy(async () => {
  const module = await import('@/features/user-hub/pages/FullConstructorPage')
  return { default: module.FullConstructorPage }
})

function LegacyDashboardRedirect() {
  const location = useLocation()

  return (
    <Navigate
      to={{
        pathname: DISPATCH_DEFAULT_PATH,
        search: location.search,
      }}
      replace
    />
  )
}

const userHubPlaceholderElement = (
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
    <h2 style={{ margin: 0, fontSize: '1rem', color: '#e2e8f0' }}>User Hub - Page (Phase 4-8)</h2>
    <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
      Wired in Phase 4-8 - coming soon
    </p>
  </div>
)

export const userHubRouteChildren: RouteObject[] = [
  {
    element: <UserHubLayout />,
    children: [
      {
        index: true,
        element: renderLazyRoute(GalleryPage, 'Loading gallery...'),
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
        path: 'dispatch/*',
        element: renderLazyRoute(DispatchWorkspacePage, 'Loading dispatch workspace...'),
      },
      {
        path: 'dashboard',
        element: <LegacyDashboardRedirect />,
      },
      userHubEquipmentRoute,
      {
        path: 'profile',
        element: renderLazyRoute(ProfilePage, 'Loading profile...'),
      },
      {
        path: '*',
        element: userHubPlaceholderElement,
      },
    ],
  },
]
