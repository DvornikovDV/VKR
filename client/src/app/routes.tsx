// T012 [US1] - React Router v7: public routes + protected hub shells
// Route wiring order (per tasks.md):
//   T012 (public + hub shell) -> T019 (user hub) -> T026 (admin hub) ->
//   T031 (editors) -> T036 (dashboard) -> T040 (profile/edge)
//
// DO NOT add routes here out of order. Each subsequent Task appends to this file.

import { createBrowserRouter, Navigate } from 'react-router-dom'
import { LandingPage } from '@/features/public/pages/LandingPage'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { RegisterPage } from '@/features/auth/pages/RegisterPage'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { adminHubRouteChildren } from '@/app/adminHubRoutes'
import { userHubRouteChildren } from '@/app/userHubRoutes'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },

  {
    path: '/hub',
    element: <ProtectedRoute requiredRole="USER" />,
    children: userHubRouteChildren,
  },

  {
    path: '/admin',
    element: <ProtectedRoute requiredRole="ADMIN" />,
    children: adminHubRouteChildren,
  },

  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
