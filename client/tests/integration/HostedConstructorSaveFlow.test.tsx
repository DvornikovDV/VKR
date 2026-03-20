import { useState } from 'react'
import { act } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { useAuthStore, type Session } from '@/shared/store/useAuthStore'
import { isApiError } from '@/shared/api/client'
import { cloneDiagram, getDiagramById, updateDiagram } from '@/shared/api/diagrams'
import type { LayoutDocument } from '@/features/constructor-host/types'
import {
  exportLayoutPayload,
  importLayoutPayload,
  LayoutPayloadError,
} from '@/features/constructor-host/adapters/layoutAdapter'
import { SaveAsDialog } from '@/shared/components/SaveAsDialog'
import { SaveConflictModal } from '@/shared/components/SaveConflictModal'

const userSession: Session = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'USER',
  tier: 'FREE',
  accessToken: 'user-token',
}

function createRepresentativeLayout(): LayoutDocument {
  return {
    images: [
      {
        id: 'image-1',
        src: '/constructor/assets/backgrounds/boiler.png',
        x: 24,
        y: 36,
        width: 800,
        height: 460,
        opacity: 0.95,
      },
    ],
    widgets: [
      {
        id: 'widget-1',
        widgetType: 'gauge',
        x: 320,
        y: 220,
        width: 128,
        height: 128,
        properties: {
          label: 'Boiler Pressure',
          color: '#22c55e',
          precision: 1,
          showUnit: true,
        },
      },
    ],
    connectionPoints: [
      {
        id: 'cp-1',
        ownerId: 'widget-1',
        x: 380,
        y: 260,
      },
    ],
    connections: [
      {
        id: 'connection-1',
        from: 'cp-1',
        to: 'cp-2',
        style: { stroke: '#f59e0b', strokeWidth: 2 },
        label: 'Feed line',
      },
    ],
    viewState: {
      zoom: 1.15,
      panX: -12,
      panY: 8,
    },
  }
}

function SaveAsFlowHarness({ currentLayout }: { currentLayout: LayoutDocument }) {
  const [isOpen, setIsOpen] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdCopyId, setCreatedCopyId] = useState<string | null>(null)

  return (
    <div>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open Save As
      </button>
      {createdCopyId && <p data-testid="save-as-result">{createdCopyId}</p>}
      <SaveAsDialog
        open={isOpen}
        isSubmitting={isSubmitting}
        onCancel={() => setIsOpen(false)}
        onSubmit={async (name) => {
          setIsSubmitting(true)
          try {
            const created = await cloneDiagram({
              name,
              layout: exportLayoutPayload(currentLayout),
            })
            setCreatedCopyId(`${created._id}:${created.name}`)
            setIsOpen(false)
          } finally {
            setIsSubmitting(false)
          }
        }}
      />
    </div>
  )
}

function SaveConflictFlowHarness({
  diagramId,
  initialVersion,
  initialLayout,
}: {
  diagramId: string
  initialVersion: number
  initialLayout: LayoutDocument
}) {
  const [isConflictOpen, setIsConflictOpen] = useState(false)
  const [isReloadingLatest, setIsReloadingLatest] = useState(false)
  const [isSavingAs, setIsSavingAs] = useState(false)
  const [layout, setLayout] = useState<LayoutDocument>(initialLayout)
  const [version, setVersion] = useState(initialVersion)
  const [actions, setActions] = useState<string[]>([])

  async function attemptInPlaceSave() {
    try {
      await updateDiagram(diagramId, {
        layout: exportLayoutPayload(layout),
        __v: version,
      })
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setIsConflictOpen(true)
        return
      }

      throw error
    }
  }

  return (
    <div>
      <button type="button" onClick={() => void attemptInPlaceSave()}>
        Attempt in-place save
      </button>
      <pre data-testid="layout-state">{JSON.stringify(layout)}</pre>
      <div data-testid="version-state">{version}</div>
      <div data-testid="action-log">{actions.join(',')}</div>

      <SaveConflictModal
        open={isConflictOpen}
        isReloadingLatest={isReloadingLatest}
        isSavingAs={isSavingAs}
        onContinueEditing={() => {
          setActions((previous) => [...previous, 'continue'])
          setIsConflictOpen(false)
        }}
        onSaveAs={async () => {
          setIsSavingAs(true)
          try {
            await cloneDiagram({
              name: 'Recovered conflict copy',
              layout: exportLayoutPayload(layout),
            })
            setActions((previous) => [...previous, 'save-as'])
            setIsConflictOpen(false)
          } finally {
            setIsSavingAs(false)
          }
        }}
        onReloadLatest={async () => {
          setIsReloadingLatest(true)
          try {
            const latest = await getDiagramById(diagramId)
            setLayout(importLayoutPayload(latest.layout))
            setVersion(latest.__v)
            setActions((previous) => [...previous, 'reload'])
            setIsConflictOpen(false)
          } finally {
            setIsReloadingLatest(false)
          }
        }}
      />
    </div>
  )
}

beforeEach(() => {
  act(() => {
    useAuthStore.setState({ session: null, isAuthenticated: false })
    useAuthStore.getState().setSession(userSession)
  })
})

describe('Hosted constructor save flow coverage (T016)', () => {
  it('round-trips representative layout through API helpers and keeps parity sections (T018)', async () => {
    const storedDiagram = {
      _id: 'diagram-42',
      name: 'Main Diagram',
      layout: createRepresentativeLayout(),
      __v: 7,
    }

    server.use(
      http.get('/api/diagrams/:id', () =>
        HttpResponse.json({
          status: 'success',
          data: storedDiagram,
        }),
      ),
      http.put('/api/diagrams/:id', async ({ request }) => {
        const payload = (await request.json()) as {
          layout?: unknown
          __v: number
        }

        if (payload.__v !== storedDiagram.__v) {
          return HttpResponse.json(
            { status: 'error', message: 'Version conflict' },
            { status: 409 },
          )
        }

        storedDiagram.layout = importLayoutPayload(payload.layout ?? {})
        storedDiagram.__v += 1

        return HttpResponse.json({
          status: 'success',
          data: storedDiagram,
          bindingsInvalidated: false,
        })
      }),
    )

    const loaded = await getDiagramById('diagram-42')
    const loadedLayout = importLayoutPayload(loaded.layout)
    const loadedWidgets = (loadedLayout.widgets as Array<Record<string, unknown>> | undefined) ?? []

    const editedLayout = exportLayoutPayload({
      ...loadedLayout,
      widgets: [
        ...loadedWidgets,
        {
          id: 'widget-2',
          widgetType: 'lamp',
          properties: { label: 'Alarm lamp', color: '#ef4444' },
        },
      ],
    })

    await updateDiagram('diagram-42', {
      layout: editedLayout,
      __v: loaded.__v,
    })

    const reopened = await getDiagramById('diagram-42')
    const reopenedLayout = importLayoutPayload(reopened.layout)

    expect(reopenedLayout).toEqual(editedLayout)
    expect(Array.isArray(reopenedLayout.images)).toBe(true)
    expect(Array.isArray(reopenedLayout.widgets)).toBe(true)
    expect(Array.isArray(reopenedLayout.connectionPoints)).toBe(true)
    expect(Array.isArray(reopenedLayout.connections)).toBe(true)
    expect(reopened.__v).toBe(8)

    expect(() => importLayoutPayload(null)).toThrow(LayoutPayloadError)
    expect(() => importLayoutPayload({ widgets: { id: 'broken' } })).toThrow(LayoutPayloadError)
    expect(() => exportLayoutPayload({ connectionPoints: 12 })).toThrow(LayoutPayloadError)
  })

  it('runs Save As naming flow through dialog + clone API with trimmed name (T019)', async () => {
    const user = userEvent.setup()
    const representativeLayout = createRepresentativeLayout()
    let lastCreatePayload: { name: string; layout: unknown } | null = null

    server.use(
      http.post('/api/diagrams', async ({ request }) => {
        lastCreatePayload = (await request.json()) as { name: string; layout: unknown }

        return HttpResponse.json(
          {
            status: 'success',
            data: {
              _id: 'diagram-copy-1',
              name: lastCreatePayload.name,
              layout: lastCreatePayload.layout,
              __v: 0,
            },
          },
          { status: 201 },
        )
      }),
    )

    render(<SaveAsFlowHarness currentLayout={representativeLayout} />)

    await user.click(screen.getByRole('button', { name: 'Create copy' }))
    expect(screen.getByText('Enter a diagram name before creating a copy.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Diagram name'), '   Boiler Hall Copy   ')
    await user.click(screen.getByRole('button', { name: 'Create copy' }))

    expect(await screen.findByTestId('save-as-result')).toHaveTextContent(
      'diagram-copy-1:Boiler Hall Copy',
    )
    expect(lastCreatePayload).not.toBeNull()
    expect(lastCreatePayload?.name).toBe('Boiler Hall Copy')
    expect(lastCreatePayload?.layout).toEqual(representativeLayout)
  })

  it('handles version conflict actions: continue, save-as, reload-latest (T020)', async () => {
    const user = userEvent.setup()
    const latestLayout = {
      widgets: [{ id: 'widget-latest', properties: { label: 'Saved widget' } }],
    } satisfies LayoutDocument
    const dirtyLayout = {
      widgets: [{ id: 'widget-dirty', properties: { label: 'Draft widget' } }],
    } satisfies LayoutDocument

    const storedDiagram = {
      _id: 'diagram-conflict',
      name: 'Conflicted Diagram',
      layout: latestLayout,
      __v: 5,
    }

    const saveAsPayloads: Array<{ name: string; layout: unknown }> = []

    server.use(
      http.get('/api/diagrams/:id', () =>
        HttpResponse.json({
          status: 'success',
          data: storedDiagram,
        }),
      ),
      http.put('/api/diagrams/:id', async ({ request }) => {
        const payload = (await request.json()) as { __v: number }
        if (payload.__v !== storedDiagram.__v) {
          return HttpResponse.json(
            { status: 'error', message: 'Version conflict' },
            { status: 409 },
          )
        }

        return HttpResponse.json({
          status: 'success',
          data: storedDiagram,
          bindingsInvalidated: false,
        })
      }),
      http.post('/api/diagrams', async ({ request }) => {
        const payload = (await request.json()) as { name: string; layout: unknown }
        saveAsPayloads.push(payload)

        return HttpResponse.json(
          {
            status: 'success',
            data: {
              _id: `copy-${saveAsPayloads.length}`,
              name: payload.name,
              layout: payload.layout,
            },
          },
          { status: 201 },
        )
      }),
    )

    render(
      <SaveConflictFlowHarness
        diagramId="diagram-conflict"
        initialVersion={4}
        initialLayout={dirtyLayout}
      />,
    )

    expect(screen.getByTestId('layout-state')).toHaveTextContent('widget-dirty')
    expect(screen.getByTestId('version-state')).toHaveTextContent('4')

    await user.click(screen.getByRole('button', { name: 'Attempt in-place save' }))
    expect(await screen.findByText('Save conflict detected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue editing' }))
    await waitFor(() => {
      expect(screen.queryByText('Save conflict detected')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('layout-state')).toHaveTextContent('widget-dirty')
    expect(screen.getByTestId('action-log')).toHaveTextContent('continue')

    await user.click(screen.getByRole('button', { name: 'Attempt in-place save' }))
    expect(await screen.findByText('Save conflict detected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save As copy' }))

    await waitFor(() => {
      expect(screen.queryByText('Save conflict detected')).not.toBeInTheDocument()
    })
    expect(saveAsPayloads).toHaveLength(1)
    expect(saveAsPayloads[0].name).toBe('Recovered conflict copy')
    expect(saveAsPayloads[0].layout).toEqual(dirtyLayout)
    expect(screen.getByTestId('layout-state')).toHaveTextContent('widget-dirty')
    expect(screen.getByTestId('action-log')).toHaveTextContent('continue,save-as')

    await user.click(screen.getByRole('button', { name: 'Attempt in-place save' }))
    expect(await screen.findByText('Save conflict detected')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reload latest' }))

    await waitFor(() => {
      expect(screen.queryByText('Save conflict detected')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('layout-state')).toHaveTextContent('widget-latest')
    expect(screen.getByTestId('version-state')).toHaveTextContent('5')
    expect(screen.getByTestId('action-log')).toHaveTextContent('continue,save-as,reload')
  })
})

