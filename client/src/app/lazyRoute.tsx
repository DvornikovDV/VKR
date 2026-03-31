import { Suspense, type ComponentType, type LazyExoticComponent } from 'react'

interface RoutePendingStateProps {
  label: string
}

function RoutePendingState({ label }: RoutePendingStateProps) {
  return (
    <div className="flex min-h-[18rem] flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--color-surface-border)] text-sm text-[#94a3b8]">
      {label}
    </div>
  )
}

export function renderLazyRoute(
  LazyComponent: LazyExoticComponent<ComponentType>,
  label = 'Loading page...',
) {
  return (
    <Suspense fallback={<RoutePendingState label={label} />}>
      <LazyComponent />
    </Suspense>
  )
}
