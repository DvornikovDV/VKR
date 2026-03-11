import { GalleryVerticalEnd, House, Server, Users } from 'lucide-react'
import { AppShell, type NavItem } from '@/shared/components/AppShell'

const adminHubNavItems: NavItem[] = [
  {
    label: 'Overview',
    to: '/admin',
    icon: <House size={16} />,
  },
  {
    label: 'Edge Fleet',
    to: '/admin/edge',
    icon: <Server size={16} />,
  },
  {
    label: 'Users',
    to: '/admin/users',
    icon: <Users size={16} />,
  },
  {
    label: 'Diagrams',
    to: '/admin/diagrams',
    icon: <GalleryVerticalEnd size={16} />,
  },
]

export function AdminHubLayout() {
  return <AppShell hubTitle="Admin Hub" navItems={adminHubNavItems} />
}
