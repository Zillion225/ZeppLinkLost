import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { log } from '@zos/utils'
import { createConnectionAlertController } from '../core/connection-alert-controller'
import { parseServiceMode, SERVICE_MODE_DEBUG } from '../core/service-mode'
import { createZeppAlertRuntime } from '../platform/zepp-alert-runtime'
import {
  getAlarmSound,
  getAlarmStopTimeMs,
  getDebugSimulatedConnected,
  getDisconnectDelayMs,
  getVibrationEnabled,
} from '../utils/settings'

const logger = log.getLogger('linklost-service')
const SERVICE_FILE = 'app-service/connection-monitor'

let controller
let debugMode = false
let bleListenerRegistered = false

function readConnection() {
  return debugMode ? getDebugSimulatedConnected() : connectStatus()
}

function handleConnectionChange(status) {
  if (!debugMode && controller && typeof status === 'boolean') {
    controller.updateConnection(status, 'ble-listener')
  }
}

function createController() {
  const runtime = createZeppAlertRuntime({
    debug: debugMode,
    serviceFile: SERVICE_FILE,
    logger,
  })

  controller = createConnectionAlertController({
    ...runtime,
    settings: {
      getAlarmSound,
      getAlarmStopTimeMs,
      getDisconnectDelayMs,
      getVibrationEnabled,
    },
    connection: { isConnected: readConnection },
    onStateChange: ({ connected, isInitialState, source }) => {
      logger.log(
        `${source}: ${connected ? 'CONNECTED' : 'DISCONNECTED'}${
          isInitialState ? ' (initial)' : ''
        }`,
      )
    },
    logger,
  })
}

function startProductionMonitor() {
  createConnect((index, data, size) => {
    logger.debug(`Received companion data: index=${index}, size=${size}`)
  })
  controller.initialize(connectStatus())
  addListener(handleConnectionChange)
  bleListenerRegistered = true
  logger.log('Production BLE listener registered')
}

function startDebugMonitor() {
  // Supplying true then false creates the same transition used by real BLE.
  controller.initialize(true)
  if (!getDebugSimulatedConnected()) {
    controller.updateConnection(false, 'debug-input')
  }
  logger.log('Debug connection input initialized')
}

AppService({
  onInit(params) {
    debugMode = parseServiceMode(params) === SERVICE_MODE_DEBUG
    logger.log(`Connection monitor starting: ${debugMode ? 'DEBUG' : 'PRODUCTION'}`)
    createController()

    if (debugMode) {
      startDebugMonitor()
    } else {
      startProductionMonitor()
    }
  },

  onEvent(event) {
    if (
      controller &&
      typeof event === 'string' &&
      event.includes('action=stop-alarm')
    ) {
      controller.stopAlarm('user pressed Stop alarm')
    }
  },

  onDestroy() {
    // The Debug page stores CONNECTED before stopping this service.
    if (debugMode && controller && getDebugSimulatedConnected()) {
      controller.updateConnection(true, 'debug-input')
    }

    if (controller) {
      controller.destroy()
      controller = undefined
    }
    if (bleListenerRegistered) {
      removeListener()
      disConnect()
      bleListenerRegistered = false
    }
    logger.log('Connection monitor stopped')
  },
})
