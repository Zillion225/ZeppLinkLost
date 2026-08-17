/**
 * Coordinates audio and vibration without knowing anything about Zepp OS.
 * Audio reports its real start time, so the vibration and auto-stop timer begin
 * at the same moment as the audible alarm.
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
      audio.stop()
      vibration.stop()
      log(`Alarm stopped: ${reason}`)
    }
  }

  function start({ sound, durationMs, vibrationEnabled }) {
    stop('restarting')
    active = true
    const currentRunToken = ++runToken

    audio.start(
      sound,
      () => {
        if (!active || currentRunToken !== runToken) {
          return
        }

        started = true
        if (vibrationEnabled) {
          vibration.start()
        }

        // Audio and vibration share this exact cutoff.
        stopTimerId = scheduler.setTimeout(() => {
          stopTimerId = null
          stop('auto-stop reached')
        }, durationMs)
        log(`Alarm started for ${durationMs}ms`)
      },
      () => {
        if (active && currentRunToken === runToken) {
          warn('Alarm audio could not be prepared')
          stop('audio preparation failed')
        }
      },
    )
  }

  return {
    start,
    stop,
    getState() {
      return { active, started }
    },
  }
}
