import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { log } from '@zos/utils'
import { createConnectionAlertController } from '../core/connection-alert-controller'
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

function isDebugParam(options) {
  return typeof options === 'string' && options.includes('mode=debug')
}

function readConnection() {
  return debugMode ? getDebugSimulatedConnected() : connectStatus()
}

function handleConnectionChange(status) {
  if (controller && typeof status === 'boolean') {
    controller.updateConnection(status, 'ble-listener')
  }
}

function createController() {
  const runtime = createZeppAlertRuntime({
    debug: debugMode,
    serviceFile: SERVICE_FILE,
    logger,
  })

  // Settings and connection reads are injected, keeping the workflow testable.
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
  logger.log('Background BLE connection listener registered')
}

function startDebugSimulation() {
  // Begin from a known connected baseline, then feed the simulated transition.
  controller.initialize(true)
  controller.updateConnection(false, 'debug-toggle')
  logger.log('Debug disconnect simulation started')
}

AppService({
  onInit(options) {
    debugMode = isDebugParam(options)
    logger.log(`Connection monitor starting in ${debugMode ? 'DEBUG' : 'PRODUCTION'} mode`)
    createController()

    if (debugMode) {
      startDebugSimulation()
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
    // The Debug page writes CONNECTED before stopping us, so restoration uses
    // the same controller transition and notification path as production.
    if (debugMode && controller && getDebugSimulatedConnected()) {
      controller.updateConnection(true, 'debug-toggle')
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
