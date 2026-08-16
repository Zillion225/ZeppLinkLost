import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { notify } from '@zos/notification'
import { log } from '@zos/utils'
import { createConnectionStateMachine } from '../utils/connection-state'

const logger = log.getLogger('linklost-service')

let connectionStateMachine

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

AppService({
  onInit() {
    logger.log('Background connection monitor starting')

    connectionStateMachine = createConnectionStateMachine({
      onStateChange: ({ connected, isInitialState, source }) => {
        logger.log(
          `${source}: ${connected ? 'CONNECTED' : 'DISCONNECTED'}${
            isInitialState ? ' (initial)' : ''
          }`,
        )
      },
      onDisconnect: () => {
        logger.warn('Background disconnect detected; sending Link Lost notification')
        sendDisconnectNotification()
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
    removeListener()
    disConnect()
    connectionStateMachine = undefined
    logger.log('Background connection monitor stopped')
  },
})
