import { Suspense, lazy } from 'react'
import { type RouteObject } from 'react-router-dom'
import { renderLazyRoute } from '@/app/lazyRoute'
import { userHubEquipmentRoute } from '@/features/user-hub/routes/userHubEquipmentRoute'

const UserHubLayout = lazy(async () => {
  const module = await import('@/features/user-hub/UserHubLayout')
  return { default: module.UserHubLayout }
})

const GalleryPage = lazy(async () => {
  const module = await import('@/features/user-hub/pages/GalleryPage')
  return { default: module.GalleryPage }
})

const DashboardPage = lazy(async () => {
  const module = await import('@/features/user-hub/pages/DashboardPage')
  return { default: module.DashboardPage }
})

const ProfilePage = lazy(async () => {
  const module = await import('@/features/user-hub/pages/ProfilePage')
  return { default: module.ProfilePage }
})

const FullConstructorPage = lazy(async () => {
  const module = await import('@/features/user-hub/pages/FullConstructorPage')
  return { default: module.FullConstructorPage }
})

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
    element: renderLazyRoute(UserHubLayout, 'Loading user hub...'),
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
        path: 'dashboard',
        element: renderLazyRoute(DashboardPage, 'Loading dashboard...'),
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
