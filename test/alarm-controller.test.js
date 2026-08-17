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
    start(durationMs) {
      vibrationEvents.push({
        type: 'start',
        durationMs,
        at: scheduler.now(),
      })
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

test('vibration and cutoff do not wait for the media prepare callback', () => {
  const harness = createHarness()
  harness.alarm.start({
    sound: { file: 'alarm.mp3' },
    durationMs: 10000,
    vibrationEnabled: true,
  })

  assert.deepEqual(harness.vibrationEvents, [
    { type: 'start', durationMs: 10000, at: 0 },
  ])
  assert.deepEqual(harness.alarm.getState(), { active: true, started: true })

  harness.scheduler.advanceBy(9999)
  assert.equal(harness.audioEvents.at(-1).type, 'prepare')
  assert.equal(harness.vibrationEvents.at(-1).type, 'start')

  harness.scheduler.advanceBy(1)
  assert.deepEqual(harness.audioEvents.at(-1), { type: 'stop', at: 10000 })
  assert.deepEqual(harness.vibrationEvents.at(-1), {
    type: 'stop',
    at: 10000,
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
  assert.deepEqual(harness.vibrationEvents, [
    { type: 'start', durationMs: 10000, at: 0 },
    { type: 'stop', at: 0 },
  ])
})

test('audio preparation failure does not cancel vibration or cutoff', () => {
  const harness = createHarness()
  harness.alarm.start({
    sound: { file: 'missing.mp3' },
    durationMs: 10000,
    vibrationEnabled: true,
  })
  harness.audioFailed()

  assert.deepEqual(harness.alarm.getState(), { active: true, started: true })
  assert.equal(harness.scheduler.pendingCount(), 1)
  harness.scheduler.advanceBy(10000)
  assert.deepEqual(harness.alarm.getState(), { active: false, started: false })
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

  assert.equal(logger.messages.length, 2)
})

test('a vibration driver exception does not stop audio or the cutoff timer', () => {
  const scheduler = createFakeScheduler()
  const audioEvents = []
  let onAudioStarted
  const alarm = createAlarmController({
    scheduler,
    audio: {
      start(sound, onStarted) {
        onAudioStarted = onStarted
      },
      stop() {
        audioEvents.push({ type: 'stop', at: scheduler.now() })
      },
    },
    vibration: {
      start() {
        throw new Error('motor busy')
      },
      stop() {},
    },
  })

  alarm.start({
    sound: { file: 'alarm.mp3' },
    durationMs: 10000,
    vibrationEnabled: true,
  })
  assert.doesNotThrow(() => onAudioStarted())
  assert.deepEqual(alarm.getState(), { active: true, started: true })

  scheduler.advanceBy(10000)
  assert.deepEqual(audioEvents, [{ type: 'stop', at: 10000 }])
  assert.deepEqual(alarm.getState(), { active: false, started: false })
})

test('a synchronous media driver exception cannot escape alarm start', () => {
  const scheduler = createFakeScheduler()
  const alarm = createAlarmController({
    scheduler,
    audio: {
      start() {
        throw new Error('player unavailable')
      },
      stop() {},
    },
    vibration: { start() {}, stop() {} },
  })

  assert.doesNotThrow(() =>
    alarm.start({
      sound: { file: 'alarm.mp3' },
      durationMs: 10000,
      vibrationEnabled: true,
    }),
  )
  assert.deepEqual(alarm.getState(), { active: true, started: true })
  assert.equal(scheduler.pendingCount(), 1)
})

test('audio stop failure still allows vibration cleanup', () => {
  const scheduler = createFakeScheduler()
  let onAudioStarted
  let vibrationStopped = false
  const alarm = createAlarmController({
    scheduler,
    audio: {
      start(sound, onStarted) {
        onAudioStarted = onStarted
      },
      stop() {
        throw new Error('player stop failed')
      },
    },
    vibration: {
      start() {},
      stop() {
        vibrationStopped = true
      },
    },
  })

  alarm.start({
    sound: { file: 'alarm.mp3' },
    durationMs: 10000,
    vibrationEnabled: true,
  })
  onAudioStarted()

  assert.doesNotThrow(() => alarm.stop('test'))
  assert.equal(vibrationStopped, true)
  assert.deepEqual(alarm.getState(), { active: false, started: false })
})
