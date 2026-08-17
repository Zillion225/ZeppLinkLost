import {
  getAllAppServices,
  start as startAppService,
  stop as stopAppService,
} from '@zos/app-service'
import { SCROLL_MODE_FREE, setScrollMode } from '@zos/page'
import { back } from '@zos/router'
import { align, createWidget, prop, text_style, widget } from '@zos/ui'
import { log } from '@zos/utils'
import { DEBUG_PAGE_ENABLED } from '../utils/developer'
import {
  getDebugSimulatedConnected,
  getDebugSimulationActive,
  getMonitoringEnabled,
  setDebugSimulatedConnected,
  setDebugSimulationActive,
} from '../utils/settings'
import * as Styles from 'zosLoader:./debug.[pf].layout.js'

const logger = log.getLogger('linklost-debug')
const MONITOR_SERVICE_FILE = 'app-service/connection-monitor'

let statusWidget
let debugModeButton
let simulationButton
let detailWidget
let debugModeEnabled = false
let simulatedConnected = true
let serviceOperationRevision = 0

function isMonitorServiceRunning() {
  return getAllAppServices().some(
    (service) =>
      service === MONITOR_SERVICE_FILE ||
      service === `${MONITOR_SERVICE_FILE}.js`,
  )
}

function setDetail(text) {
  if (detailWidget) {
    detailWidget.setProperty(prop.TEXT, text)
  }
}

function startMonitor({ debug, operationRevision }) {
  const options = {
    file: MONITOR_SERVICE_FILE,
    reload: !debug,
    complete_func: ({ result }) => {
      logger.log(`${debug ? 'Debug' : 'Production'} start result: ${result}`)
      if (operationRevision === serviceOperationRevision) {
        setDetail(
          result
            ? debug
              ? 'Debug monitor is running.'
              : 'Real Bluetooth monitor restored.'
            : 'Could not start the connection monitor',
        )
      }
    },
  }

  if (debug) {
    options.param = 'mode=debug'
  }

  const errorCode = startAppService(options)
  logger.log(`Monitor start request code: ${errorCode}`)
}

function replaceMonitor({ start, debug = false }) {
  const operationRevision = ++serviceOperationRevision

  const finish = () => {
    if (operationRevision !== serviceOperationRevision) {
      return
    }
    if (start) {
      startMonitor({ debug, operationRevision })
    }
  }

  if (!isMonitorServiceRunning()) {
    finish()
    return
  }

  stopAppService({
    file: MONITOR_SERVICE_FILE,
    complete_func: ({ result }) => {
      logger.log(`Monitor stop result: ${result}`)
      if (!result && operationRevision === serviceOperationRevision) {
        setDetail('Could not stop the current connection monitor')
        return
      }
      finish()
    },
  })
}

function renderSimulationState() {
  if (!statusWidget) {
    return
  }

  statusWidget.setProperty(
    prop.TEXT,
    debugModeEnabled
      ? simulatedConnected
        ? 'SIMULATED: CONNECTED'
        : 'SIMULATED: DISCONNECTED'
      : 'REAL BLUETOOTH ACTIVE',
  )
  statusWidget.setProperty(
    prop.COLOR,
    debugModeEnabled
      ? simulatedConnected
        ? 0x58d68d
        : 0xff6b7a
      : 0x8fd9ec,
  )

  if (!debugModeButton || !simulationButton) {
    return
  }

  debugModeButton.setProperty(prop.MORE, {
    ...Styles.DEBUG_MODE_BUTTON_STYLE,
    radius: 44,
    normal_color: debugModeEnabled ? 0x21734d : 0xa63737,
    press_color: debugModeEnabled ? 0x4aa97a : 0xd86565,
    color: 0xffffff,
    text: debugModeEnabled ? 'DEBUG MODE ON' : 'DEBUG MODE OFF',
    text_size: 28,
    click_func: toggleDebugMode,
  })

  // Keep click_func in every BUTTON update; prop.MORE replaces button options.
  simulationButton.setProperty(prop.MORE, {
    ...Styles.TOGGLE_BUTTON_STYLE,
    radius: 52,
    normal_color: !debugModeEnabled
      ? 0x3c4650
      : simulatedConnected
        ? 0x21734d
        : 0xa63737,
    press_color: !debugModeEnabled
      ? 0x596673
      : simulatedConnected
        ? 0x4aa97a
        : 0xd86565,
    color: 0xffffff,
    text: !debugModeEnabled
      ? 'ENABLE DEBUG MODE'
      : simulatedConnected
        ? 'SIMULATE DISCONNECT'
        : 'SIMULATE RECONNECT',
    text_size: 27,
    click_func: toggleSimulation,
  })
}

function toggleDebugMode() {
  debugModeEnabled = !debugModeEnabled

  if (debugModeEnabled) {
    // Debug always starts from a clean connected baseline.
    simulatedConnected = true
    setDebugSimulatedConnected(true)
    setDebugSimulationActive(true)
    replaceMonitor({ start: false })
    setDetail('Real Bluetooth detection is paused.')
  } else {
    simulatedConnected = true
    setDebugSimulatedConnected(true)
    setDebugSimulationActive(false)
    replaceMonitor({ start: getMonitoringEnabled(), debug: false })
    setDetail('Debug stopped. Real Bluetooth detection restored.')
  }

  renderSimulationState()
  logger.log(`Debug mode changed to ${debugModeEnabled ? 'ON' : 'OFF'}`)
}

function simulateDisconnect() {
  if (!simulatedConnected) {
    return
  }

  simulatedConnected = false
  setDebugSimulatedConnected(false)
  renderSimulationState()
  replaceMonitor({ start: true, debug: true })
  setDetail('Waiting for the configured alert delay...')
  logger.log('Debug input changed to DISCONNECTED')
}

function simulateReconnect() {
  if (simulatedConnected) {
    return
  }

  simulatedConnected = true
  setDebugSimulatedConnected(true)
  renderSimulationState()
  replaceMonitor({ start: false })
  setDetail('Simulated connection restored.')
  logger.log('Debug input changed to CONNECTED')
}

function toggleSimulation() {
  if (!debugModeEnabled) {
    setDetail('Turn DEBUG MODE ON first.')
    return
  }

  if (simulatedConnected) {
    simulateDisconnect()
  } else {
    simulateReconnect()
  }
}

Page({
  onInit() {
    if (!DEBUG_PAGE_ENABLED) {
      back()
      return
    }

    debugModeEnabled = getDebugSimulationActive()
    simulatedConnected = getDebugSimulatedConnected()
    if (debugModeEnabled) {
      replaceMonitor({ start: !simulatedConnected, debug: true })
    }
  },

  build() {
    if (!DEBUG_PAGE_ENABLED) {
      return
    }

    // A pushed page must replace the vertical swiper used by the main screen.
    setScrollMode({ mode: SCROLL_MODE_FREE })

    createWidget(widget.TEXT, {
      ...Styles.TITLE_STYLE,
      color: 0xf4bd50,
      text: 'DEBUG SIMULATOR',
      text_size: 30,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    debugModeButton = createWidget(widget.BUTTON, {
      ...Styles.DEBUG_MODE_BUTTON_STYLE,
      radius: 44,
      normal_color: 0xa63737,
      press_color: 0xd86565,
      color: 0xffffff,
      text: 'DEBUG MODE OFF',
      text_size: 28,
      click_func: toggleDebugMode,
    })

    statusWidget = createWidget(widget.TEXT, {
      ...Styles.STATUS_STYLE,
      color: 0x58d68d,
      text: 'SIMULATED: CONNECTED',
      text_size: 29,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    simulationButton = createWidget(widget.BUTTON, {
      ...Styles.TOGGLE_BUTTON_STYLE,
      radius: 52,
      normal_color: 0x3c4650,
      press_color: 0x596673,
      color: 0xffffff,
      text: 'ENABLE DEBUG MODE',
      text_size: 27,
      click_func: toggleSimulation,
    })

    detailWidget = createWidget(widget.TEXT, {
      ...Styles.DETAIL_STYLE,
      color: 0xaec4dc,
      text: 'Debug Mode must be ON before simulation.',
      text_size: 17,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.WRAP,
    })

    createWidget(widget.TEXT, {
      ...Styles.HINT_STYLE,
      color: 0x8ea4ba,
      text: 'Swipe right to return',
      text_size: 17,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    renderSimulationState()
  },

  onDestroy() {
    // Debug Mode is explicit and remains in its selected state until toggled.
    statusWidget = undefined
    debugModeButton = undefined
    simulationButton = undefined
    detailWidget = undefined
  },
})
