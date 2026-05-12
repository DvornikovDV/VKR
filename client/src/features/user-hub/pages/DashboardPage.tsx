import { Navigate, useLocation } from 'react-router-dom'
import { DISPATCH_DEFAULT_PATH } from '@/features/dispatch/model/routes'

export function DashboardPage() {
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
