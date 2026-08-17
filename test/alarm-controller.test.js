import assert from 'node:assert/strict'
import test from 'node:test'
import { createAlarmController } from '../core/alarm-controller.js'
import { createFakeScheduler } from './fake-scheduler.js'

function createHarness(logger) {
  const scheduler = createFakeScheduler()
  const audioEvents = []
  const vibrationEvents = []
  let onAudioStarted = null
  let onAudioFailed = null

  const audio = {
    start(sound, onStarted, onFailed) {
      audioEvents.push({ type: 'prepare', sound, at: scheduler.now() })
      onAudioStarted = onStarted
      onAudioFailed = onFailed
    },
    stop() {
      audioEvents.push({ type: 'stop', at: scheduler.now() })
      onAudioStarted = null
      onAudioFailed = null
    },
  }

  const vibration = {
    start() {
      vibrationEvents.push({ type: 'start', at: scheduler.now() })
    },
    stop() {
      vibrationEvents.push({ type: 'stop', at: scheduler.now() })
    },
  }

  return {
    scheduler,
    audioEvents,
    vibrationEvents,
    alarm: createAlarmController({ scheduler, audio, vibration, logger }),
    audioReady() {
      const callback = onAudioStarted
      onAudioStarted = null
      callback()
    },
    audioFailed() {
      const callback = onAudioFailed
      onAudioFailed = null
      callback()
    },
  }
}

test('vibration starts with audible playback and stops at the same cutoff', () => {
  const harness = createHarness()
  harness.alarm.start({
    sound: { file: 'alarm.mp3' },
    durationMs: 10000,
    vibrationEnabled: true,
  })

  harness.scheduler.advanceBy(350)
  assert.deepEqual(harness.vibrationEvents, [])

  harness.audioReady()
  assert.deepEqual(harness.vibrationEvents, [{ type: 'start', at: 350 }])

  harness.scheduler.advanceBy(9999)
  assert.equal(harness.audioEvents.at(-1).type, 'prepare')
  assert.equal(harness.vibrationEvents.at(-1).type, 'start')

  harness.scheduler.advanceBy(1)
  assert.deepEqual(harness.audioEvents.at(-1), { type: 'stop', at: 10350 })
  assert.deepEqual(harness.vibrationEvents.at(-1), {
    type: 'stop',
    at: 10350,
  })
  assert.deepEqual(harness.alarm.getState(), { active: false, started: false })
})

test('vibration remains off when the setting is disabled', () => {
  const harness = createHarness()
  harness.alarm.start({
    sound: { file: 'alarm.mp3' },
    durationMs: 5000,
    vibrationEnabled: false,
  })
  harness.audioReady()
  harness.scheduler.advanceBy(5000)

  assert.equal(
    harness.vibrationEvents.filter((event) => event.type === 'start').length,
    0,
  )
})

test('stopping during audio preparation prevents a late alarm start', () => {
  const harness = createHarness()
  harness.alarm.start({
    sound: { file: 'alarm.mp3' },
    durationMs: 10000,
    vibrationEnabled: true,
  })
  harness.alarm.stop('connection restored')

  assert.deepEqual(harness.alarm.getState(), { active: false, started: false })
  assert.equal(harness.scheduler.pendingCount(), 0)
  assert.deepEqual(harness.vibrationEvents, [{ type: 'stop', at: 0 }])
})

test('audio preparation failure stops the whole alarm', () => {
  const harness = createHarness()
  harness.alarm.start({
    sound: { file: 'missing.mp3' },
    durationMs: 10000,
    vibrationEnabled: true,
  })
  harness.audioFailed()

  assert.deepEqual(harness.alarm.getState(), { active: false, started: false })
  assert.equal(harness.scheduler.pendingCount(), 0)
})

test('alarm logger methods keep their required object context', () => {
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
  const harness = createHarness(logger)
  harness.alarm.start({
    sound: { file: 'alarm.mp3' },
    durationMs: 1000,
    vibrationEnabled: true,
  })
  harness.audioReady()

  assert.equal(logger.messages.length, 1)
})
