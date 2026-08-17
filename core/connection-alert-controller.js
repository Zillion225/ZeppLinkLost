const noop = () => {}

/**
 * Pure connection-loss workflow. All timers, settings, connection reads, alerts,
 * and alarm effects are injected so this logic can run on-device or in tests.
 */
export function createConnectionAlertController({
  scheduler,
  settings,
  connection,
  notifier,
  alarm,
  notificationSettleDelayMs = 1300,
  onStateChange = noop,
  logger = {},
}) {
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

  let connected = null
  let stateRevision = 0
  let pendingDisconnectTimerId = null
  let alarmStartTimerId = null
  let disconnectNotificationSent = false
  let destroyed = false

  function clearTimer(timerId) {
    if (timerId !== null) {
      scheduler.clearTimeout(timerId)
    }
  }

  function cancelPendingDisconnect() {
    clearTimer(pendingDisconnectTimerId)
    pendingDisconnectTimerId = null
  }

  function cancelAlarmStart() {
    clearTimer(alarmStartTimerId)
    alarmStartTimerId = null
  }

  function stillDisconnected(revision) {
    if (destroyed || revision !== stateRevision || connected !== false) {
      return false
    }

    const verifiedConnection = connection.isConnected()
    if (verifiedConnection !== false) {
      // Recover the state even if the platform missed a reconnect callback.
      if (typeof verifiedConnection === 'boolean') {
        updateConnection(verifiedConnection, 'connection-verification')
      }
      return false
    }

    return true
  }

  function scheduleAlarmStart(revision) {
    alarmStartTimerId = scheduler.setTimeout(() => {
      alarmStartTimerId = null
      if (!stillDisconnected(revision)) {
        return
      }

      alarm.start({
        sound: settings.getAlarmSound(),
        durationMs: settings.getAlarmStopTimeMs(),
        vibrationEnabled: settings.getVibrationEnabled(),
      })
    }, notificationSettleDelayMs)
  }

  function scheduleDisconnectAlert() {
    cancelPendingDisconnect()
    const revision = stateRevision
    const delayMs = settings.getDisconnectDelayMs()
    log(`Connection lost; waiting ${delayMs}ms before alerting`)

    pendingDisconnectTimerId = scheduler.setTimeout(() => {
      pendingDisconnectTimerId = null
      if (!stillDisconnected(revision)) {
        log('Disconnect alert cancelled because connection state changed')
        return
      }

      disconnectNotificationSent = Boolean(notifier.disconnected())
      if (!disconnectNotificationSent) {
        warn('Disconnect notification delivery failed')
        return
      }

      scheduleAlarmStart(revision)
    }, delayMs)
  }

  function updateConnection(nextConnected, source = 'external') {
    if (destroyed || typeof nextConnected !== 'boolean') {
      return false
    }

    const previousConnected = connected
    const isInitialState = previousConnected === null
    const didChange = previousConnected !== nextConnected
    connected = nextConnected

    if (!didChange) {
      return false
    }

    stateRevision += 1
    onStateChange({ connected, isInitialState, source })

    if (nextConnected) {
      cancelPendingDisconnect()
      cancelAlarmStart()
      if (!isInitialState) {
        alarm.stop('connection restored')
      }

      if (!isInitialState && previousConnected === false && disconnectNotificationSent) {
        notifier.restored()
        disconnectNotificationSent = false
      }
    } else if (previousConnected === true) {
      scheduleDisconnectAlert()
    }

    return true
  }

  return {
    initialize(initialConnected) {
      return updateConnection(initialConnected, 'initial-read')
    },

    updateConnection,

    stopAlarm(reason = 'user requested stop') {
      cancelAlarmStart()
      alarm.stop(reason)
    },

    destroy() {
      if (destroyed) {
        return
      }

      destroyed = true
      cancelPendingDisconnect()
      cancelAlarmStart()
      alarm.stop('controller destroyed')
    },

    getState() {
      return {
        connected,
        disconnectNotificationSent,
        hasPendingDisconnect: pendingDisconnectTimerId !== null,
        hasPendingAlarmStart: alarmStartTimerId !== null,
      }
    },
  }
}
