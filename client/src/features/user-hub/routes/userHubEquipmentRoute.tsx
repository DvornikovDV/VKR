import { type RouteObject } from 'react-router-dom'
import { MyEquipmentPage } from '@/features/user-hub/pages/MyEquipmentPage'

export const userHubEquipmentRoute: RouteObject = {
  path: 'edge',
  element: <MyEquipmentPage />,
}
