import { describe, expect, it } from 'vitest'
import {
  mapCatalogRowsToDeviceMetricCatalog,
  mapCatalogCommandsToDeviceCommandCatalog,
} from '@/features/constructor-host/adapters/catalogAdapter'
import type { EdgeCapabilitiesCatalogSnapshot } from '@/shared/api/edgeServers'

describe('catalogAdapter', () => {
  const edgeServerId = 'edge-1'
  const mockCatalogSnapshot: EdgeCapabilitiesCatalogSnapshot = {
    edgeServerId,
    telemetry: [
      {
        deviceId: 'dev-1',
        metric: 'temp',
        label: 'Temperature',
        valueType: 'number',
      },
      {
        deviceId: 'dev-1',
        metric: 'status',
        label: 'Status',
        valueType: 'string',
      },
    ],
    commands: [
      {
        deviceId: 'dev-1',
        commandType: 'set_number',
        valueType: 'number',
        reportedMetric: 'temp',
        label: 'Set Temperature',
        min: 0,
        max: 100,
      },
      {
        deviceId: 'dev-2',
        commandType: 'set_bool',
        valueType: 'boolean',
        reportedMetric: 'active',
        label: 'Set Active',
      },
    ],
  }

  describe('mapCatalogRowsToDeviceMetricCatalog', () => {
    it('maps telemetry metrics separately and ignores commands', () => {
      const result = mapCatalogRowsToDeviceMetricCatalog(edgeServerId, mockCatalogSnapshot)
      
      expect(result).toHaveLength(1)
      expect(result[0].deviceId).toBe('dev-1')
      expect(result[0].metrics).toHaveLength(2)
      
      const metrics = result[0].metrics.map(m => m.key)
      expect(metrics).toContain('temp')
      expect(metrics).toContain('status')
      
      // Should not contain commands
      expect(metrics).not.toContain('set_number')
      expect(metrics).not.toContain('set_bool')
    })

    it('returns empty array if edgeServerId is empty', () => {
      const result = mapCatalogRowsToDeviceMetricCatalog(' ', mockCatalogSnapshot)
      expect(result).toHaveLength(0)
    })
  })

  describe('mapCatalogCommandsToDeviceCommandCatalog', () => {
    it('maps commands separately and ignores telemetry metrics', () => {
      const result = mapCatalogCommandsToDeviceCommandCatalog(edgeServerId, mockCatalogSnapshot)
      
      expect(result).toHaveLength(2)
      
      const dev1 = result.find(r => r.deviceId === 'dev-1')
      expect(dev1).toBeDefined()
      expect(dev1?.commands).toHaveLength(1)
      expect(dev1?.commands[0].commandType).toBe('set_number')
      expect(dev1?.commands[0].reportedMetric).toBe('temp')

      const dev2 = result.find(r => r.deviceId === 'dev-2')
      expect(dev2).toBeDefined()
      expect(dev2?.commands).toHaveLength(1)
      expect(dev2?.commands[0].commandType).toBe('set_bool')
    })

    it('returns empty array if edgeServerId is empty', () => {
      const result = mapCatalogCommandsToDeviceCommandCatalog(' ', mockCatalogSnapshot)
      expect(result).toHaveLength(0)
    })
  })
})
