import { describe, expect, it } from 'vitest'
import {
  DISPATCH_COMMAND_AUDIT_STATUS_OPTIONS,
  createDispatchCommandAuditRequestGuard,
  formatDispatchCommandAuditPayload,
  getDispatchCommandAuditFailureReasonLabel,
  getDispatchCommandAuditStatusLabel,
  isDispatchCommandAuditRequestCurrent,
} from '@/features/dispatch/model/commandAudit'

describe('dispatch command audit model helpers', () => {
  it('formats audit display values and guards stale selected-edge responses', () => {
    const activeGuard = createDispatchCommandAuditRequestGuard(2, {
      edgeId: 'edge-2',
      page: 1,
      limit: 50,
      status: 'confirmed',
    })
    const staleGuard = createDispatchCommandAuditRequestGuard(1, {
      edgeId: 'edge-1',
      page: 1,
      limit: 50,
      status: 'confirmed',
    })

    expect(DISPATCH_COMMAND_AUDIT_STATUS_OPTIONS.map((option) => option.value)).toEqual([
      'all',
      'accepted',
      'sent_to_edge',
      'confirmed',
      'timeout',
      'failed',
    ])
    expect(getDispatchCommandAuditStatusLabel('sent_to_edge')).toBe('Sent to edge')
    expect(getDispatchCommandAuditFailureReasonLabel('edge_command_timeout')).toBe(
      'Edge command timeout',
    )
    expect(formatDispatchCommandAuditPayload({ value: true })).toBe('{"value":true}')
    expect(isDispatchCommandAuditRequestCurrent(activeGuard, activeGuard)).toBe(true)
    expect(isDispatchCommandAuditRequestCurrent(activeGuard, staleGuard)).toBe(false)
  })
})
