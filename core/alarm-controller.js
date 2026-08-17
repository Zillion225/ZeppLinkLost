/**
 * Coordinates audio and vibration without knowing anything about Zepp OS.
 * The alarm lifetime never depends on an asynchronous media callback: some
 * background runtimes may delay or omit PREPARE while the notification is open.
 */
export function createAlarmController({ scheduler, audio, vibration, logger = {} }) {
  // Zepp's logger methods depend on their object context, so never detach them.
  const log = (message) => {
    if (typeof logger.log === 'function') {
      logger.log(message)
    }
  }
  const warn = (message) => {
    if (typeof logger.warn === 'function') {
      logger.warn(message)
    }
  }

  let runToken = 0
  let active = false
  let started = false
  let stopTimerId = null

  function describeError(error) {
    return error && error.message ? error.message : String(error)
  }

  function clearStopTimer() {
    if (stopTimerId === null) {
      return
    }

    scheduler.clearTimeout(stopTimerId)
    stopTimerId = null
  }

  function stop(reason = 'manual stop') {
    const wasActive = active
    runToken += 1
    active = false
    started = false
    clearStopTimer()

    if (wasActive) {
      // Each hardware effect is isolated so one driver failure cannot kill the
      // background connection service or prevent the other effect from stopping.
      try {
        audio.stop()
      } catch (error) {
        warn(`Alarm audio stop failed: ${describeError(error)}`)
      }
      try {
        vibration.stop()
      } catch (error) {
        warn(`Alarm vibration stop failed: ${describeError(error)}`)
      }
      log(`Alarm stopped: ${reason}`)
    }
  }

  function start({ sound, durationMs, vibrationEnabled }) {
    stop('restarting')
    active = true
    started = true
    const currentRunToken = ++runToken

    if (vibrationEnabled) {
      try {
        vibration.start(durationMs)
      } catch (error) {
        warn(`Alarm vibration start failed: ${describeError(error)}`)
      }
    }

    // Arm the safety cutoff immediately, even if custom audio never prepares.
    try {
      stopTimerId = scheduler.setTimeout(() => {
        stopTimerId = null
        stop('auto-stop reached')
      }, durationMs)
    } catch (error) {
      warn(`Alarm cutoff timer failed: ${describeError(error)}`)
      stop('cutoff scheduling failed')
      return
    }

    try {
      audio.start(
        sound,
        () => {
          if (active && currentRunToken === runToken) {
            log('Alarm audio playback started')
          }
        },
        () => {
          if (active && currentRunToken === runToken) {
            // Vibration and the safety cutoff continue even without custom audio.
            warn('Alarm audio could not be prepared')
          }
        },
      )
    } catch (error) {
      // A media failure must not cancel vibration or the alarm lifetime.
      warn(`Alarm audio start failed: ${describeError(error)}`)
    }

    log(`Alarm started for ${durationMs}ms`)
  }

  return {
    start,
    stop,
    getState() {
      return { active, started }
    },
  }
}
