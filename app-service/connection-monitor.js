import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { notify } from '@zos/notification'
import { create as createMediaPlayer, id as mediaId } from '@zos/media'
import { SystemSounds } from '@zos/sensor'
import { createSysTimer, stopTimer } from '@zos/timer'
import { log } from '@zos/utils'
import { createConnectionStateMachine } from '../utils/connection-state'
import {
  getAlarmSound,
  getAlarmStopTimeMs,
  getDisconnectDelayMs,
} from '../utils/settings'

const logger = log.getLogger('linklost-service')
const systemSounds = new SystemSounds()
const alarmPlayer = createMediaPlayer(mediaId.PLAYER)

let connectionStateMachine
let currentConnectionState = null
let pendingDisconnectTimerId = null
let alarmStopTimerId = null
let alarmIsPlaying = false
let disconnectNotificationSent = false
let connectionStateRevision = 0

alarmPlayer.addEventListener(alarmPlayer.event.PREPARE, (ready) => {
  if (!ready) {
    alarmIsPlaying = false
    logger.warn('Link Lost alarm file could not be prepared')
    return
  }

  if (alarmIsPlaying) {
    alarmPlayer.start()
    logger.log('Started Link Lost custom alarm audio')
  }
})

function stopDisconnectAlarm(reason) {
  if (alarmStopTimerId !== null) {
    stopTimer(alarmStopTimerId)
    alarmStopTimerId = null
  }

  if (!alarmIsPlaying) {
    return
  }

  alarmPlayer.stop()
  alarmIsPlaying = false
  logger.log(`Link Lost alarm stopped: ${reason}`)
}

function playDisconnectAlarm() {
  stopDisconnectAlarm('starting a new alarm')
  const selectedSound = getAlarmSound()
  const alarmStopTimeMs = getAlarmStopTimeMs()

  alarmIsPlaying = true
  alarmPlayer.setSource(alarmPlayer.source.FILE, {
    file: selectedSound.file,
  })
  alarmPlayer.prepare()

  // This is a safety cutoff when the user does not press Stop alarm.
  const timerId = createSysTimer(false, alarmStopTimeMs, () => {
    if (alarmStopTimerId === timerId) {
      alarmStopTimerId = null
      alarmPlayer.stop()
      alarmIsPlaying = false
      logger.log(`Link Lost alarm stopped after ${alarmStopTimeMs}ms`)
    }
  })

  alarmStopTimerId = timerId
  logger.log(
    `Started Link Lost ${selectedSound.label} alarm for ${alarmStopTimeMs}ms`,
  )
}

function playReconnectSound() {
  if (!systemSounds.getEnabled()) {
    logger.log('Link Lost sound is disabled in the watch system settings')
    return
  }

  systemSounds.start(systemSounds.getSourceType().ACHIEVE)
  logger.log('Played Link Lost reconnect sound')
}

function handleConnectionChange(status) {
  if (typeof status !== 'boolean') {
    logger.warn('Ignored BLE callback without a boolean connection status')
    return
  }

  connectionStateMachine.update(status)
}

function sendDisconnectNotification() {
  const notificationId = notify({
    title: 'Link Lost',
    content: 'LK: Phone connection lost',
    actions: [
      {
        text: 'Stop alarm',
        file: 'app-service/connection-monitor',
        param: 'action=stop-alarm',
      },
    ],
    vibrate: 5,
  })

  logger.log(
    notificationId
      ? `Link Lost disconnect notification delivered: ${notificationId}`
      : 'Link Lost disconnect notification delivery failed',
  )

  if (notificationId) {
    playDisconnectAlarm()
  }
}

function sendReconnectNotification() {
  const notificationId = notify({
    title: 'Link Lost',
    content: 'LK: Phone connection restored',
    actions: [],
    vibrate: 4,
  })

  logger.log(
    notificationId
      ? `Link Lost reconnect notification delivered: ${notificationId}`
      : 'Link Lost reconnect notification delivery failed',
  )

  if (notificationId) {
    playReconnectSound()
  }
}

function cancelPendingDisconnectAlert() {
  if (pendingDisconnectTimerId === null) {
    return
  }

  stopTimer(pendingDisconnectTimerId)
  pendingDisconnectTimerId = null
  logger.log('Disconnect alert cancelled because the phone reconnected')
}

function scheduleDisconnectAlert() {
  cancelPendingDisconnectAlert()
  const disconnectDelayMs = getDisconnectDelayMs()
  logger.log(
    `Phone connection lost; waiting ${disconnectDelayMs}ms before alerting`,
  )

  // A revision token makes old callbacks harmless after any later connection change.
  const disconnectRevision = connectionStateRevision

  // Ignore brief BLE drops. Only a sustained disconnect becomes an alert.
  const timerId = createSysTimer(
    false,
    disconnectDelayMs,
    () => {
      if (pendingDisconnectTimerId === timerId) {
        pendingDisconnectTimerId = null
      }

      if (disconnectRevision !== connectionStateRevision) {
        logger.log('Disconnect alert skipped because the connection state changed')
        return
      }

      const actualConnectionState = connectStatus()
      if (actualConnectionState !== false) {
        // Recover if a reconnect event was missed, so the next disconnect can re-arm.
        logger.log('Disconnect alert skipped because the phone is connected')
        connectionStateMachine.update(actualConnectionState)
        return
      }

      if (currentConnectionState !== false) {
        logger.log('Disconnect alert skipped because the phone reconnected')
        return
      }

      logger.warn('Disconnect confirmed; sending Link Lost notification')
      sendDisconnectNotification()
      disconnectNotificationSent = true
    },
  )

  pendingDisconnectTimerId = timerId
}

AppService({
  onInit() {
    logger.log('Background connection monitor starting')

    connectionStateMachine = createConnectionStateMachine({
      onStateChange: ({ connected, isInitialState, source }) => {
        const previousConnectionState = currentConnectionState
        currentConnectionState = connected
        connectionStateRevision += 1

        if (connected) {
          cancelPendingDisconnectAlert()
          stopDisconnectAlarm('phone reconnected')

          // A reconnect is useful only after this app has sent a lost-phone alert.
          if (!isInitialState && previousConnectionState === false && disconnectNotificationSent) {
            sendReconnectNotification()
            disconnectNotificationSent = false
          }
        }

        logger.log(
          `${source}: ${connected ? 'CONNECTED' : 'DISCONNECTED'}${
            isInitialState ? ' (initial)' : ''
          }`,
        )
      },
      onDisconnect: () => {
        scheduleDisconnectAlert()
      },
    })

    createConnect((index, data, size) => {
      logger.debug(`Received companion data: index=${index}, size=${size}`)
    })
    connectionStateMachine.initialize(connectStatus())
    addListener(handleConnectionChange)
    logger.log('Background BLE connection listener registered')
  },

  // Notification actions are delivered to the app service while it is running.
  onEvent(event) {
    if (typeof event === 'string' && event.includes('action=stop-alarm')) {
      stopDisconnectAlarm('user pressed Stop alarm')
    }
  },

  onDestroy() {
    cancelPendingDisconnectAlert()
    stopDisconnectAlarm('background service stopped')
    removeListener()
    disConnect()
    connectionStateMachine = undefined
    logger.log('Background connection monitor stopped')
  },
})
