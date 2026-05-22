import { Activity, GalleryVerticalEnd, Server, UserCircle2 } from 'lucide-react'
import { AppShell, type NavItem } from '@/shared/components/AppShell'
import { ruUiText } from '@/shared/i18n'

const userHubNavItems: NavItem[] = [
  {
    label: ruUiText.navigation.diagrams,
    to: '/hub',
    icon: <GalleryVerticalEnd size={16} />,
  },
  {
    label: ruUiText.navigation.dispatch,
    to: '/hub/dispatch',
    icon: <Activity size={16} />,
  },
  {
    label: ruUiText.navigation.equipment,
    to: '/hub/edge',
    icon: <Server size={16} />,
  },
  {
    label: ruUiText.navigation.profile,
    to: '/hub/profile',
    icon: <UserCircle2 size={16} />,
  },
]

export function UserHubLayout() {
  return <AppShell hubTitle={ruUiText.navigation.userHub} navItems={userHubNavItems} showWorkspaceHeader={false} />
}
