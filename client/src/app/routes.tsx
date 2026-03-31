import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/shared/components/ProtectedRoute'
import { adminHubRouteChildren } from '@/app/adminHubRoutes'
import { renderLazyRoute } from '@/app/lazyRoute'
import { userHubRouteChildren } from '@/app/userHubRoutes'

const LandingPage = lazy(async () => {
  const module = await import('@/features/public/pages/LandingPage')
  return { default: module.LandingPage }
})

const LoginPage = lazy(async () => {
  const module = await import('@/features/auth/pages/LoginPage')
  return { default: module.LoginPage }
})

const RegisterPage = lazy(async () => {
  const module = await import('@/features/auth/pages/RegisterPage')
  return { default: module.RegisterPage }
})

export const router = createBrowserRouter([
  {
    path: '/',
    element: renderLazyRoute(LandingPage, 'Loading landing page...'),
  },
  {
    path: '/login',
    element: renderLazyRoute(LoginPage, 'Loading sign-in page...'),
  },
  {
    path: '/register',
    element: renderLazyRoute(RegisterPage, 'Loading registration page...'),
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
