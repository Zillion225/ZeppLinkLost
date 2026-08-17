import assert from 'node:assert/strict'
import test from 'node:test'
import { createConnectionAlertController } from '../core/connection-alert-controller.js'
import { createFakeScheduler } from './fake-scheduler.js'

function createHarness({ notificationSucceeds = true, logger } = {}) {
  const scheduler = createFakeScheduler()
  const events = []
  let externalConnected = true

  const settings = {
    getDisconnectDelayMs: () => 1000,
    getAlarmStopTimeMs: () => 10000,
    getAlarmSound: () => ({ id: 'alarm', file: 'alarm.mp3' }),
    getVibrationEnabled: () => true,
  }
  const notifier = {
    disconnected() {
      events.push({ type: 'lost-notification', at: scheduler.now() })
      return notificationSucceeds
    },
    restored() {
      events.push({ type: 'restored-notification', at: scheduler.now() })
      return true
    },
  }
  const alarm = {
    start(options) {
      events.push({ type: 'alarm-start', at: scheduler.now(), options })
    },
    stop(reason) {
      events.push({ type: 'alarm-stop', at: scheduler.now(), reason })
    },
  }
  const controller = createConnectionAlertController({
    scheduler,
    settings,
    connection: { isConnected: () => externalConnected },
    notifier,
    alarm,
    notificationSettleDelayMs: 200,
    logger,
  })

  return {
    scheduler,
    events,
    controller,
    setExternalConnected(value) {
      externalConnected = value
    },
  }
}

test('sustained disconnect follows delay, notification, settle, then alarm', () => {
  const harness = createHarness()
  harness.controller.initialize(true)
  harness.setExternalConnected(false)
  harness.controller.updateConnection(false, 'test-input')

  harness.scheduler.advanceBy(999)
  assert.equal(harness.events.length, 0)

  harness.scheduler.advanceBy(1)
  assert.deepEqual(harness.events[0], { type: 'lost-notification', at: 1000 })

  harness.scheduler.advanceBy(199)
  assert.equal(harness.events.length, 1)
  harness.scheduler.advanceBy(1)

  assert.equal(harness.events[1].type, 'alarm-start')
  assert.equal(harness.events[1].at, 1200)
  assert.equal(harness.events[1].options.durationMs, 10000)
  assert.equal(harness.events[1].options.vibrationEnabled, true)
})

test('reconnect before delay cancels the lost alert', () => {
  const harness = createHarness()
  harness.controller.initialize(true)
  harness.setExternalConnected(false)
  harness.controller.updateConnection(false)
  harness.scheduler.advanceBy(500)

  harness.setExternalConnected(true)
  harness.controller.updateConnection(true)
  harness.scheduler.advanceBy(1000)

  assert.equal(
    harness.events.some((event) => event.type === 'lost-notification'),
    false,
  )
  assert.equal(
    harness.events.some((event) => event.type === 'alarm-start'),
    false,
  )
})

test('reconnect after notification cancels alarm and sends restored alert', () => {
  const harness = createHarness()
  harness.controller.initialize(true)
  harness.setExternalConnected(false)
  harness.controller.updateConnection(false)
  harness.scheduler.advanceBy(1200)

  harness.setExternalConnected(true)
  harness.controller.updateConnection(true)

  assert.equal(harness.events.at(-2).type, 'alarm-stop')
  assert.equal(harness.events.at(-1).type, 'restored-notification')
})

test('external connection verification prevents a stale disconnect alert', () => {
  const harness = createHarness()
  harness.controller.initialize(true)
  harness.setExternalConnected(false)
  harness.controller.updateConnection(false)

  harness.setExternalConnected(true)
  harness.scheduler.advanceBy(1000)

  assert.equal(
    harness.events.some((event) => event.type === 'lost-notification'),
    false,
  )
  assert.equal(
    harness.events.some((event) => event.type === 'alarm-start'),
    false,
  )
  assert.equal(harness.controller.getState().connected, true)
})

test('failed notification does not start the alarm', () => {
  const harness = createHarness({ notificationSucceeds: false })
  harness.controller.initialize(true)
  harness.setExternalConnected(false)
  harness.controller.updateConnection(false)
  harness.scheduler.advanceBy(5000)

  assert.equal(harness.events[0].type, 'lost-notification')
  assert.equal(
    harness.events.some((event) => event.type === 'alarm-start'),
    false,
  )
})

test('a second disconnect is armed after a reconnect', () => {
  const harness = createHarness()
  harness.controller.initialize(true)

  harness.setExternalConnected(false)
  harness.controller.updateConnection(false)
  harness.scheduler.advanceBy(1200)
  harness.setExternalConnected(true)
  harness.controller.updateConnection(true)

  harness.setExternalConnected(false)
  harness.controller.updateConnection(false)
  harness.scheduler.advanceBy(1200)

  assert.equal(
    harness.events.filter((event) => event.type === 'lost-notification').length,
    2,
  )
  assert.equal(
    harness.events.filter((event) => event.type === 'alarm-start').length,
    2,
  )
})

test('logger methods keep their required object context', () => {
  const logger = {
    messages: [],
    log(message) {
      assert.equal(this, logger)
      this.messages.push(message)
    },
    warn(message) {
      assert.equal(this, logger)
      this.messages.push(message)
    },
  }
  const harness = createHarness({ logger })
  harness.controller.initialize(true)
  harness.setExternalConnected(false)
  harness.controller.updateConnection(false)
  harness.scheduler.advanceBy(1000)

  assert.equal(logger.messages.length > 0, true)
})
