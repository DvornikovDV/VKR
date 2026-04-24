import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import type { ReactNode } from 'react'
import type {
  DashboardViewportPanInput,
  DashboardViewportState,
} from '@/features/dashboard/model/viewport'

interface DashboardViewportControlsProps {
  viewport: DashboardViewportState
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToView: () => void
  onReset: () => void
  onPan: (pan: DashboardViewportPanInput) => void
}

const PAN_STEP = 48

function formatScale(scale: number): string {
  return `${Math.round(scale * 100)}%`
}

interface IconButtonProps {
  label: string
  onClick: () => void
  children: ReactNode
}

function IconButton({ label, onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#334155] bg-[#0f172a] text-[#e2e8f0] transition-colors hover:bg-[#1e293b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]"
    >
      {children}
    </button>
  )
}

export function DashboardViewportControls({
  viewport,
  onZoomIn,
  onZoomOut,
  onFitToView,
  onReset,
  onPan,
}: DashboardViewportControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#1f2a3d] bg-[#0b1220] px-3 py-2">
      <p className="text-xs font-medium text-[#cbd5e1]">Viewport: {viewport.mode} at {formatScale(viewport.scale)}</p>

      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Zoom in" onClick={onZoomIn}>
          <ZoomIn size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Zoom out" onClick={onZoomOut}>
          <ZoomOut size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Fit to view" onClick={onFitToView}>
          <Maximize2 size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Reset view" onClick={onReset}>
          <RotateCcw size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Pan left" onClick={() => onPan({ deltaX: PAN_STEP, deltaY: 0 })}>
          <ArrowLeft size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Pan right" onClick={() => onPan({ deltaX: -PAN_STEP, deltaY: 0 })}>
          <ArrowRight size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Pan up" onClick={() => onPan({ deltaX: 0, deltaY: PAN_STEP })}>
          <ArrowUp size={16} aria-hidden="true" />
        </IconButton>
        <IconButton label="Pan down" onClick={() => onPan({ deltaX: 0, deltaY: -PAN_STEP })}>
          <ArrowDown size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  )
}
