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
const DISCONNECT_CONFIRMATION_DELAY_MS = 5000

let connectionStateMachine
let currentConnectionState = null
let pendingDisconnectTimerId = 0
let disconnectNotificationSent = false

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
  if (!pendingDisconnectTimerId) {
    return
  }

  stopTimer(pendingDisconnectTimerId)
  pendingDisconnectTimerId = 0
  logger.log('Disconnect alert cancelled because the phone reconnected')
}

function scheduleDisconnectAlert() {
  cancelPendingDisconnectAlert()
  logger.log(
    `Phone connection lost; waiting ${DISCONNECT_CONFIRMATION_DELAY_MS}ms before alerting`,
  )

  // Ignore brief BLE drops. Only a sustained disconnect becomes an alert.
  pendingDisconnectTimerId = createSysTimer(
    false,
    DISCONNECT_CONFIRMATION_DELAY_MS,
    () => {
      pendingDisconnectTimerId = 0

      if (currentConnectionState !== false) {
        logger.log('Disconnect alert skipped because the phone reconnected')
        return
      }

      logger.warn('Disconnect confirmed; sending Link Lost notification')
      sendDisconnectNotification()
      disconnectNotificationSent = true
    },
  )
}

AppService({
  onInit() {
    logger.log('Background connection monitor starting')

    connectionStateMachine = createConnectionStateMachine({
      onStateChange: ({ connected, isInitialState, source }) => {
        const previousConnectionState = currentConnectionState
        currentConnectionState = connected

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
