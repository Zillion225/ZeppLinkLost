import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { notify } from '@zos/notification'
import { createSysTimer, stopTimer } from '@zos/timer'
import { log } from '@zos/utils'
import { createConnectionStateMachine } from '../utils/connection-state'

const logger = log.getLogger('linklost-service')
const DISCONNECT_CONFIRMATION_DELAY_MS = 10000

let connectionStateMachine
let currentConnectionState = null
let pendingDisconnectTimerId = null
let disconnectNotificationSent = false
let connectionStateRevision = 0

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
    actions: [],
    vibrate: 5,
  })

  logger.log(
    notificationId
      ? `Link Lost disconnect notification delivered: ${notificationId}`
      : 'Link Lost disconnect notification delivery failed',
  )
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
  logger.log(
    `Phone connection lost; waiting ${DISCONNECT_CONFIRMATION_DELAY_MS}ms before alerting`,
  )

  // A revision token makes old callbacks harmless after any later connection change.
  const disconnectRevision = connectionStateRevision

  // Ignore brief BLE drops. Only a sustained disconnect becomes an alert.
  const timerId = createSysTimer(
    false,
    DISCONNECT_CONFIRMATION_DELAY_MS,
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

  onDestroy() {
    cancelPendingDisconnectAlert()
    removeListener()
    disConnect()
    connectionStateMachine = undefined
    logger.log('Background connection monitor stopped')
  },
})
