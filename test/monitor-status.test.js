import assert from 'node:assert/strict'
import test from 'node:test'
import { getMonitorStatus, MonitorStatus } from '../core/monitor-status.js'

test('monitor status never reports active without a running App Service', () => {
  assert.equal(
    getMonitorStatus({ enabled: true, serviceActive: false }),
    MonitorStatus.UNAVAILABLE,
  )
})

test('monitor status represents the permission and service startup period', () => {
  assert.equal(
    getMonitorStatus({ enabled: true, permissionPending: true }),
    MonitorStatus.STARTING,
  )
  assert.equal(
    getMonitorStatus({ enabled: true, serviceStartPending: true }),
    MonitorStatus.STARTING,
  )
})

test('monitor status represents active and disabled monitoring', () => {
  assert.equal(
    getMonitorStatus({ enabled: true, serviceActive: true }),
    MonitorStatus.ACTIVE,
  )
  assert.equal(
    getMonitorStatus({ enabled: false, serviceActive: true }),
    MonitorStatus.OFF,
  )
})
