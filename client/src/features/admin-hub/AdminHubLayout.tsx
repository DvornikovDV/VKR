import { GalleryVerticalEnd, House, Server, Users } from 'lucide-react'
import { AppShell, type NavItem } from '@/shared/components/AppShell'
import { ruUiText } from '@/shared/i18n'

const adminHubNavItems: NavItem[] = [
  {
    label: ruUiText.navigation.overview,
    to: '/admin',
    icon: <House size={16} />,
  },
  {
    label: ruUiText.navigation.equipment,
    to: '/admin/edge',
    icon: <Server size={16} />,
  },
  {
    label: ruUiText.navigation.users,
    to: '/admin/users',
    icon: <Users size={16} />,
  },
  {
    label: ruUiText.navigation.diagrams,
    to: '/admin/diagrams',
    icon: <GalleryVerticalEnd size={16} />,
  },
]

export function AdminHubLayout() {
  return <AppShell hubTitle={ruUiText.navigation.adminHub} navItems={adminHubNavItems} />
}
