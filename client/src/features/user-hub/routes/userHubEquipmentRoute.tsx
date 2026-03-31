import { lazy } from 'react'
import { type RouteObject } from 'react-router-dom'
import { renderLazyRoute } from '@/app/lazyRoute'

const MyEquipmentPage = lazy(async () => {
  const module = await import('@/features/user-hub/pages/MyEquipmentPage')
  return { default: module.MyEquipmentPage }
})

export const userHubEquipmentRoute: RouteObject = {
  path: 'edge',
  element: renderLazyRoute(MyEquipmentPage, 'Loading equipment...'),
}
