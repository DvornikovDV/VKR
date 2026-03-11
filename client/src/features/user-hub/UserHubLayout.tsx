import { Activity, GalleryVerticalEnd, Server, UserCircle2 } from 'lucide-react'
import { AppShell, type NavItem } from '@/shared/components/AppShell'

const userHubNavItems: NavItem[] = [
  {
    label: 'Gallery',
    to: '/hub',
    icon: <GalleryVerticalEnd size={16} />,
  },
  {
    label: 'Dashboard',
    to: '/hub/dashboard',
    icon: <Activity size={16} />,
  },
  {
    label: 'Equipment',
    to: '/hub/edge',
    icon: <Server size={16} />,
  },
  {
    label: 'Profile',
    to: '/hub/profile',
    icon: <UserCircle2 size={16} />,
  },
]

export function UserHubLayout() {
  return <AppShell hubTitle="User Hub" navItems={userHubNavItems} />
}
