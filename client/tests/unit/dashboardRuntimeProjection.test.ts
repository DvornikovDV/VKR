import { describe, expect, it } from 'vitest'
import {
  createDashboardBindingKey,
  mergeTelemetryReadingsByBindingKey,
  selectDashboardRuntimeProjection,
} from '@/features/dashboard/model/selectors'
import { normalizeDashboardBindingProfile } from '@/shared/api/bindings'
import type {
  DashboardBindingProfile,
  DashboardCommandCatalog,
  DashboardDiagramDocument,
  DashboardMetricValueByBindingKey,
} from '@/features/dashboard/model/types'

const diagramDocument: DashboardDiagramDocument = {
  _id: 'diagram-1',
  name: 'Boiler',
  layout: {
    widgets: [
      { id: 'widget-number', type: 'number-display' },
      { id: 'widget-text', type: 'text-display' },
      { id: 'widget-led', type: 'led' },
      { id: 'widget-unsupported', type: 'button' },
    ],
  },
}

const bindingProfile: DashboardBindingProfile = {
  _id: 'binding-1',
  diagramId: 'diagram-1',
  edgeServerId: 'edge-1',
  widgetBindings: [
    { widgetId: 'widget-number', deviceId: 'pump-1', metric: 'temperature' },
    { widgetId: 'widget-text', deviceId: 'pump-1', metric: 'status' },
    { widgetId: 'widget-led', deviceId: 'pump-1', metric: 'alarm' },
    { widgetId: 'widget-unsupported', deviceId: 'pump-1', metric: 'command' },
  ],
  commandBindings: [],
}

function buildMetricMap(): DashboardMetricValueByBindingKey {
  return mergeTelemetryReadingsByBindingKey(
    {},
    [
      {
        deviceId: 'pump-1',
        metric: 'temperature',
        last: '48.5',
        ts: 1763895000000,
      },
      {
        deviceId: 'pump-1',
        metric: 'status',
        last: 15,
        ts: 1763895000100,
      },
      {
        deviceId: 'pump-1',
        metric: 'alarm',
        last: 'false',
        ts: 1763895000200,
      },
      {
        deviceId: 'pump-1',
        metric: 'command',
        last: true,
        ts: 1763895000300,
      },
    ],
  )
}

describe('dashboard runtime projection (T021)', () => {
  it('projects number-display, text-display, and led values via saved binding pairs', () => {
    const metricMap = buildMetricMap()
    const projection = selectDashboardRuntimeProjection(diagramDocument, bindingProfile, metricMap)

    expect(
      projection.widgetValueById['widget-number'],
    ).toBe(metricMap[createDashboardBindingKey('pump-1', 'temperature')])
    expect(projection.widgetValueById['widget-text']).toBe(
      metricMap[createDashboardBindingKey('pump-1', 'status')],
    )
    expect(projection.widgetValueById['widget-led']).toBe(
      metricMap[createDashboardBindingKey('pump-1', 'alarm')],
    )

    const numberWidget = projection.widgets.find((item) => item.widgetId === 'widget-number')
    const textWidget = projection.widgets.find((item) => item.widgetId === 'widget-text')
    const ledWidget = projection.widgets.find((item) => item.widgetId === 'widget-led')

    expect(numberWidget?.value).toBe(48.5)
    expect(textWidget?.value).toBe('15')
    expect(ledWidget?.value).toBe(false)
  })

  it('keeps unsupported widget entries visible in projection', () => {
    const projection = selectDashboardRuntimeProjection(diagramDocument, bindingProfile, buildMetricMap())
    const unsupportedWidget = projection.widgets.find(
      (item) => item.widgetId === 'widget-unsupported',
    )

    expect(unsupportedWidget).toEqual(
      expect.objectContaining({
        widgetId: 'widget-unsupported',
        widgetType: 'button',
        isBound: true,
        isSupported: false,
      }),
    )
  })
})

describe('dashboard command runtime projection (T006-T010)', () => {
  const commandDiagram: DashboardDiagramDocument = {
    _id: 'diagram-command-1',
    name: 'Command Runtime',
    layout: {
      widgets: [
        { id: 'toggle-running', type: 'toggle', label: 'Pump label must not bind commands' },
        { id: 'slider-flow', type: 'slider' },
        { id: 'toggle-metric-mismatch', type: 'toggle' },
        { id: 'toggle-device-mismatch', type: 'toggle' },
        { id: 'display-running', type: 'number-display' },
      ],
    },
  }

  const commandProfile: DashboardBindingProfile = {
    _id: 'binding-command-1',
    diagramId: commandDiagram._id,
    edgeServerId: 'edge-1',
    widgetBindings: [
      { widgetId: 'toggle-running', deviceId: 'pump-1', metric: 'running' },
      { widgetId: 'slider-flow', deviceId: 'pump-1', metric: 'flowRate' },
      { widgetId: 'toggle-metric-mismatch', deviceId: 'pump-1', metric: 'notRunning' },
      { widgetId: 'toggle-device-mismatch', deviceId: 'pump-2', metric: 'running' },
      { widgetId: 'display-running', deviceId: 'pump-1', metric: 'running' },
    ],
    commandBindings: [
      { widgetId: 'toggle-running', deviceId: 'pump-1', commandType: 'set_bool' },
      { widgetId: 'slider-flow', deviceId: 'pump-1', commandType: 'set_number' },
      { widgetId: 'toggle-metric-mismatch', deviceId: 'pump-1', commandType: 'set_bool' },
      { widgetId: 'toggle-device-mismatch', deviceId: 'pump-1', commandType: 'set_bool' },
      { widgetId: 'display-running', deviceId: 'pump-1', commandType: 'set_bool' },
      { widgetId: 'stale-widget', deviceId: 'pump-1', commandType: 'set_bool' },
    ],
  }

  const commandCatalog: DashboardCommandCatalog = {
    edgeServerId: 'edge-1',
    telemetry: [
      { deviceId: 'pump-1', metric: 'running', valueType: 'boolean', label: 'catalog label ignored' },
      { deviceId: 'pump-1', metric: 'flowRate', valueType: 'number', label: 'catalog flow label' },
    ],
    commands: [
      {
        deviceId: 'pump-1',
        commandType: 'set_bool',
        valueType: 'boolean',
        reportedMetric: 'running',
        label: 'Start pump',
      },
      {
        deviceId: 'pump-1',
        commandType: 'set_number',
        valueType: 'number',
        min: 0,
        max: 100,
        reportedMetric: 'flowRate',
        label: 'Set flow',
      },
    ],
  }

  const commandMetricMap = mergeTelemetryReadingsByBindingKey(
    {},
    [
      { deviceId: 'pump-1', metric: 'running', last: false, ts: 1763895000000 },
      { deviceId: 'pump-1', metric: 'flowRate', last: 42, ts: 1763895000100 },
      { deviceId: 'pump-1', metric: 'notRunning', last: true, ts: 1763895000200 },
      { deviceId: 'pump-2', metric: 'running', last: true, ts: 1763895000300 },
    ],
  )

  it('normalizes legacy dashboard binding profiles to commandBindings: []', () => {
    const normalized = normalizeDashboardBindingProfile({
      _id: 'legacy-binding',
      diagramId: commandDiagram._id,
      edgeServerId: 'edge-1',
      widgetBindings: [{ widgetId: 'toggle-running', deviceId: 'pump-1', metric: 'running' }],
    })

    expect(normalized.commandBindings).toEqual([])
    expect(normalized.widgetBindings).toEqual([
      { widgetId: 'toggle-running', deviceId: 'pump-1', metric: 'running' },
    ])
  })

  it('keeps telemetry and command projection separated without mutating widgetValueById', () => {
    const widgetValueBefore = {
      'toggle-running': false,
      'slider-flow': 42,
      'toggle-metric-mismatch': true,
      'toggle-device-mismatch': true,
      'display-running': false,
    }

    const projection = selectDashboardRuntimeProjection(
      commandDiagram,
      commandProfile,
      commandMetricMap,
      commandCatalog,
    )

    expect(projection.widgetValueById).toEqual(widgetValueBefore)
    expect(projection.widgetValueById['toggle-running']).toBe(false)
    expect(projection.commandAvailabilityByWidgetId['toggle-running']).toMatchObject({
      widgetId: 'toggle-running',
      isExecutable: true,
      commandType: 'set_bool',
    })
    expect(projection.commandAvailabilityByWidgetId['slider-flow']).toMatchObject({
      widgetId: 'slider-flow',
      isExecutable: true,
      commandType: 'set_number',
    })
  })

  it('projects toggle and slider actual state from reported telemetry bindings, not command wiring', () => {
    const projection = selectDashboardRuntimeProjection(
      commandDiagram,
      commandProfile,
      commandMetricMap,
      {
        ...commandCatalog,
        commands: [
          {
            deviceId: 'pump-1',
            commandType: 'set_bool',
            valueType: 'boolean',
            reportedMetric: 'running',
            label: 'Desired toggle command must not provide actual state',
          },
          {
            deviceId: 'pump-1',
            commandType: 'set_number',
            valueType: 'number',
            min: 0,
            max: 100,
            reportedMetric: 'flowRate',
            label: 'Desired slider command must not provide actual state',
          },
        ],
      },
    )

    const toggleWidget = projection.widgets.find((item) => item.widgetId === 'toggle-running')
    const sliderWidget = projection.widgets.find((item) => item.widgetId === 'slider-flow')

    expect(projection.widgetValueById['toggle-running']).toBe(false)
    expect(projection.widgetValueById['slider-flow']).toBe(42)
    expect(toggleWidget).toMatchObject({
      widgetId: 'toggle-running',
      widgetType: 'toggle',
      isBound: true,
      isSupported: true,
      value: false,
    })
    expect(sliderWidget).toMatchObject({
      widgetId: 'slider-flow',
      widgetType: 'slider',
      isBound: true,
      isSupported: true,
      value: 42,
    })
    expect(projection.commandAvailabilityByWidgetId['toggle-running'].catalogCommand?.label).toContain(
      'Desired toggle command',
    )
    expect(projection.commandAvailabilityByWidgetId['slider-flow'].catalogCommand?.label).toContain(
      'Desired slider command',
    )
  })

  it('suppresses stale and incompatible commands unless exact reported telemetry binding matches', () => {
    const projection = selectDashboardRuntimeProjection(
      commandDiagram,
      commandProfile,
      commandMetricMap,
      commandCatalog,
    )

    expect(projection.commandAvailabilityByWidgetId['toggle-metric-mismatch']).toMatchObject({
      isExecutable: false,
      reason: 'missing-reported-widget-binding',
    })
    expect(projection.commandAvailabilityByWidgetId['toggle-device-mismatch']).toMatchObject({
      isExecutable: false,
      reason: 'missing-reported-widget-binding',
    })
    expect(projection.commandAvailabilityByWidgetId['display-running']).toMatchObject({
      isExecutable: false,
      reason: 'unsupported-widget-type',
    })
    expect(projection.commandAvailabilityByWidgetId['stale-widget']).toBeUndefined()
  })

  it('suppresses command execution when the current catalog lacks the command capability', () => {
    const projection = selectDashboardRuntimeProjection(
      commandDiagram,
      commandProfile,
      commandMetricMap,
      { ...commandCatalog, commands: [] },
    )

    expect(projection.commandAvailabilityByWidgetId['toggle-running']).toMatchObject({
      isExecutable: false,
      reason: 'missing-catalog-command',
    })
    expect(projection.widgetValueById['toggle-running']).toBe(false)
  })

  it('selects a catalog command by the exact reported telemetry binding, not by first partial match', () => {
    const projection = selectDashboardRuntimeProjection(
      commandDiagram,
      commandProfile,
      commandMetricMap,
      {
        ...commandCatalog,
        commands: [
          {
            deviceId: 'pump-1',
            commandType: 'set_bool',
            valueType: 'boolean',
            reportedMetric: 'maintenanceMode',
            label: 'Unrelated set_bool command',
          },
          {
            deviceId: 'pump-1',
            commandType: 'set_bool',
            valueType: 'boolean',
            reportedMetric: 'running',
            label: 'Start pump',
          },
          ...commandCatalog.commands.filter((command) => command.commandType !== 'set_bool'),
        ],
      },
    )

    expect(projection.commandAvailabilityByWidgetId['toggle-running']).toMatchObject({
      isExecutable: true,
      reason: 'available',
      commandType: 'set_bool',
      catalogCommand: expect.objectContaining({
        reportedMetric: 'running',
      }),
    })
    expect(projection.widgetValueById['toggle-running']).toBe(false)
  })

  it('does not enable commands from command bindings alone without matching reported telemetry binding', () => {
    const commandOnlyProfile: DashboardBindingProfile = {
      ...commandProfile,
      widgetBindings: [],
      commandBindings: [{ widgetId: 'toggle-running', deviceId: 'pump-1', commandType: 'set_bool' }],
    }

    const projection = selectDashboardRuntimeProjection(
      commandDiagram,
      commandOnlyProfile,
      commandMetricMap,
      commandCatalog,
    )

    expect(projection.commandAvailabilityByWidgetId['toggle-running']).toMatchObject({
      isExecutable: false,
      reason: 'missing-reported-widget-binding',
    })
    expect(projection.widgetValueById).toEqual({})
  })

  it('keeps invalid widgets and bindings non-executable while preserving telemetry projection', () => {
    const suppressionDiagram: DashboardDiagramDocument = {
      _id: 'diagram-command-suppression',
      name: 'Command Suppression',
      layout: {
        widgets: [
          { id: 'toggle-valid', type: 'toggle' },
          { id: 'slider-valid', type: 'slider' },
          { id: 'number-command', type: 'number-display' },
          { id: 'text-command', type: 'text-display' },
          { id: 'led-command', type: 'led' },
          { id: 'button-command', type: 'button' },
          { id: 'toggle-missing-command-binding', type: 'toggle' },
          { id: 'toggle-missing-reported-binding', type: 'toggle' },
          { id: 'toggle-device-mismatch', type: 'toggle' },
          { id: 'toggle-widget-mismatch', type: 'toggle' },
          { id: 'toggle-stale-catalog', type: 'toggle' },
        ],
      },
    }
    const suppressionProfile: DashboardBindingProfile = {
      _id: 'binding-command-suppression',
      diagramId: suppressionDiagram._id,
      edgeServerId: 'edge-1',
      widgetBindings: [
        { widgetId: 'toggle-valid', deviceId: 'pump-1', metric: 'running' },
        { widgetId: 'slider-valid', deviceId: 'pump-1', metric: 'flowRate' },
        { widgetId: 'number-command', deviceId: 'pump-1', metric: 'running' },
        { widgetId: 'text-command', deviceId: 'pump-1', metric: 'running' },
        { widgetId: 'led-command', deviceId: 'pump-1', metric: 'running' },
        { widgetId: 'button-command', deviceId: 'pump-1', metric: 'running' },
        { widgetId: 'toggle-missing-command-binding', deviceId: 'pump-1', metric: 'running' },
        { widgetId: 'toggle-device-mismatch', deviceId: 'pump-2', metric: 'running' },
        { widgetId: 'reported-widget-for-widget-mismatch', deviceId: 'pump-1', metric: 'running' },
        { widgetId: 'toggle-stale-catalog', deviceId: 'pump-3', metric: 'running' },
      ],
      commandBindings: [
        { widgetId: 'toggle-valid', deviceId: 'pump-1', commandType: 'set_bool' },
        { widgetId: 'slider-valid', deviceId: 'pump-1', commandType: 'set_number' },
        { widgetId: 'number-command', deviceId: 'pump-1', commandType: 'set_bool' },
        { widgetId: 'text-command', deviceId: 'pump-1', commandType: 'set_bool' },
        { widgetId: 'led-command', deviceId: 'pump-1', commandType: 'set_bool' },
        { widgetId: 'button-command', deviceId: 'pump-1', commandType: 'set_bool' },
        { widgetId: 'toggle-missing-reported-binding', deviceId: 'pump-1', commandType: 'set_bool' },
        { widgetId: 'toggle-device-mismatch', deviceId: 'pump-1', commandType: 'set_bool' },
        { widgetId: 'toggle-widget-mismatch', deviceId: 'pump-1', commandType: 'set_bool' },
        { widgetId: 'toggle-stale-catalog', deviceId: 'pump-3', commandType: 'set_bool' },
        { widgetId: 'stale-command-widget', deviceId: 'pump-1', commandType: 'set_bool' },
      ],
    }
    const suppressionCatalog: DashboardCommandCatalog = {
      edgeServerId: 'edge-1',
      telemetry: [
        { deviceId: 'pump-1', metric: 'running', valueType: 'boolean', label: 'running' },
        { deviceId: 'pump-1', metric: 'flowRate', valueType: 'number', label: 'flowRate' },
      ],
      commands: [
        {
          deviceId: 'pump-1',
          commandType: 'set_bool',
          valueType: 'boolean',
          reportedMetric: 'running',
          label: 'set running',
        },
        {
          deviceId: 'pump-1',
          commandType: 'set_number',
          valueType: 'number',
          reportedMetric: 'flowRate',
          label: 'set flow',
        },
      ],
    }
    const metricMap = mergeTelemetryReadingsByBindingKey(
      {},
      [
        { deviceId: 'pump-1', metric: 'running', last: true, ts: 1763895000000 },
        { deviceId: 'pump-1', metric: 'flowRate', last: 45, ts: 1763895000001 },
        { deviceId: 'pump-2', metric: 'running', last: false, ts: 1763895000002 },
        { deviceId: 'pump-3', metric: 'running', last: true, ts: 1763895000003 },
      ],
    )

    const projection = selectDashboardRuntimeProjection(
      suppressionDiagram,
      suppressionProfile,
      metricMap,
      suppressionCatalog,
    )

    expect(projection.commandAvailabilityByWidgetId['toggle-valid']).toMatchObject({
      isExecutable: true,
      reason: 'available',
    })
    expect(projection.commandAvailabilityByWidgetId['slider-valid']).toMatchObject({
      isExecutable: true,
      reason: 'available',
    })
    expect(projection.commandAvailabilityByWidgetId['number-command']).toMatchObject({
      isExecutable: false,
      reason: 'unsupported-widget-type',
    })
    expect(projection.commandAvailabilityByWidgetId['text-command']).toMatchObject({
      isExecutable: false,
      reason: 'unsupported-widget-type',
    })
    expect(projection.commandAvailabilityByWidgetId['led-command']).toMatchObject({
      isExecutable: false,
      reason: 'unsupported-widget-type',
    })
    expect(projection.commandAvailabilityByWidgetId['button-command']).toMatchObject({
      isExecutable: false,
      reason: 'unsupported-widget-type',
    })
    expect(projection.commandAvailabilityByWidgetId['toggle-missing-command-binding']).toMatchObject({
      isExecutable: false,
      reason: 'missing-command-binding',
    })
    expect(projection.commandAvailabilityByWidgetId['toggle-missing-reported-binding']).toMatchObject({
      isExecutable: false,
      reason: 'missing-reported-widget-binding',
    })
    expect(projection.commandAvailabilityByWidgetId['toggle-device-mismatch']).toMatchObject({
      isExecutable: false,
      reason: 'missing-reported-widget-binding',
    })
    expect(projection.commandAvailabilityByWidgetId['toggle-widget-mismatch']).toMatchObject({
      isExecutable: false,
      reason: 'missing-reported-widget-binding',
    })
    expect(projection.commandAvailabilityByWidgetId['toggle-stale-catalog']).toMatchObject({
      isExecutable: false,
      reason: 'missing-catalog-command',
    })
    expect(projection.commandAvailabilityByWidgetId['stale-command-widget']).toBeUndefined()
    expect(projection.widgetValueById).toMatchObject({
      'toggle-valid': true,
      'slider-valid': 45,
      'number-command': true,
      'text-command': true,
      'led-command': true,
      'button-command': true,
      'toggle-missing-command-binding': true,
      'toggle-device-mismatch': false,
      'toggle-stale-catalog': true,
    })
  })
})
