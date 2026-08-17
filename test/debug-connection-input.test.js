import assert from 'node:assert/strict'
import test from 'node:test'
import { createConnectionAlertController } from '../core/connection-alert-controller.js'
import { createDebugConnectionInput } from '../core/debug-connection-input.js'
import { createFakeScheduler } from './fake-scheduler.js'

test('Debug input can toggle connected and disconnected repeatedly', () => {
  const transitions = []
  let active = false
  let simulatedConnected = true
  let actualConnected = true
  const input = createDebugConnectionInput({
    controller: {
      updateConnection(connected, source) {
        transitions.push({ connected, source })
      },
    },
    readActive: () => active,
    readSimulatedConnected: () => simulatedConnected,
    readActualConnected: () => actualConnected,
  })

  input.poll()
  active = true
  simulatedConnected = false
  input.poll()
  simulatedConnected = true
  input.poll()
  simulatedConnected = false
  input.poll()
  actualConnected = true
  active = false
  input.poll()

  assert.deepEqual(transitions, [
    { connected: true, source: 'debug-baseline' },
    { connected: false, source: 'debug-input' },
    { connected: true, source: 'debug-input' },
    { connected: false, source: 'debug-input' },
    { connected: true, source: 'debug-ended' },
  ])
})

test('simulated disconnect drives the production alert controller', () => {
  const scheduler = createFakeScheduler()
  const events = []
  let active = true
  let simulatedConnected = false

  const controller = createConnectionAlertController({
    scheduler,
    settings: {
      getDisconnectDelayMs: () => 1000,
      getAlarmStopTimeMs: () => 5000,
      getAlarmSound: () => ({ file: 'alarm.mp3' }),
      getVibrationEnabled: () => true,
    },
    connection: {
      isConnected: () => (active ? simulatedConnected : true),
    },
    notifier: {
      disconnected() {
        events.push('lost')
        return true
      },
      restored() {
        events.push('restored')
      },
    },
    alarm: {
      start() {
        events.push('alarm-start')
      },
      stop() {
        events.push('alarm-stop')
      },
    },
    notificationSettleDelayMs: 100,
  })
  controller.initialize(true)

  const input = createDebugConnectionInput({
    controller,
    readActive: () => active,
    readSimulatedConnected: () => simulatedConnected,
    readActualConnected: () => true,
  })
  input.poll()
  scheduler.advanceBy(1100)

  assert.deepEqual(events, ['lost', 'alarm-start'])

  simulatedConnected = true
  input.poll()
  assert.deepEqual(events.slice(-2), ['alarm-stop', 'restored'])
})
