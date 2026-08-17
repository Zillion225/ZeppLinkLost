import { exit as exitAppService } from '@zos/app-service'
import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { createSysTimer, stopTimer } from '@zos/timer'
import { log } from '@zos/utils'
import { createConnectionAlertController } from '../core/connection-alert-controller'
import { createDebugConnectionInput } from '../core/debug-connection-input'
import { createZeppAlertRuntime } from '../platform/zepp-alert-runtime'
import { DEBUG_PAGE_ENABLED } from '../utils/developer'
import {
  getAlarmSound,
  getAlarmStopTimeMs,
  getDebugSimulatedConnected,
  getDebugSimulationActive,
  getDisconnectDelayMs,
  getMonitoringEnabled,
  getVibrationEnabled,
} from '../utils/settings'

const logger = log.getLogger('linklost-service')
const SERVICE_FILE = 'app-service/connection-monitor'
const DEBUG_INPUT_POLL_MS = 500

let controller
let debugInput
let debugInputTimerId = null
let bleListenerRegistered = false

function readCurrentConnection() {
  return DEBUG_PAGE_ENABLED && getDebugSimulationActive()
    ? getDebugSimulatedConnected()
    : connectStatus()
}

function handleConnectionChange(status) {
  if (
    controller &&
    (!debugInput || !debugInput.isActive()) &&
    typeof status === 'boolean'
  ) {
    controller.updateConnection(status, 'ble-listener')
  }
}

function createController() {
  const runtime = createZeppAlertRuntime({
    debug: getDebugSimulationActive,
    serviceFile: SERVICE_FILE,
    logger,
  })

  // All external values are adapters, while the workflow remains platform-free.
  controller = createConnectionAlertController({
    ...runtime,
    settings: {
      getAlarmSound,
      getAlarmStopTimeMs,
      getDisconnectDelayMs,
      getVibrationEnabled,
    },
    connection: { isConnected: readCurrentConnection },
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

function startBleMonitor() {
  createConnect((index, data, size) => {
    logger.debug(`Received companion data: index=${index}, size=${size}`)
  })
  controller.initialize(connectStatus())
  addListener(handleConnectionChange)
  bleListenerRegistered = true
  logger.log('Background BLE connection listener registered')
}

function pollDebugInput() {
  if (!debugInput) {
    return
  }

  const wasActive = debugInput.isActive()
  const active = debugInput.poll()

  // A service started only for Debug should exit after the Debug page closes.
  if (wasActive && !active && !getMonitoringEnabled()) {
    exitAppService()
  }
}

function startDebugInputChannel() {
  if (!DEBUG_PAGE_ENABLED) {
    return
  }

  debugInput = createDebugConnectionInput({
    controller,
    readActive: getDebugSimulationActive,
    readSimulatedConnected: getDebugSimulatedConnected,
    readActualConnected: connectStatus,
  })
  pollDebugInput()
  debugInputTimerId = createSysTimer(true, DEBUG_INPUT_POLL_MS, pollDebugInput)
  logger.log('Debug input channel started')
}

AppService({
  onInit() {
    logger.log('Connection monitor starting')
    createController()
    startBleMonitor()
    startDebugInputChannel()
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
    if (debugInputTimerId !== null) {
      stopTimer(debugInputTimerId)
      debugInputTimerId = null
    }
    if (debugInput && debugInput.isActive() && controller) {
      controller.updateConnection(connectStatus(), 'debug-service-stop')
    }
    debugInput = undefined

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
