import {
  getAllAppServices,
  start as startAppService,
  stop as stopAppService,
} from '@zos/app-service'
import { back } from '@zos/router'
import { align, createWidget, prop, text_style, widget } from '@zos/ui'
import { log } from '@zos/utils'
import { DEBUG_PAGE_ENABLED } from '../utils/developer'
import {
  getDebugSimulatedConnected,
  getMonitoringEnabled,
  setDebugSimulatedConnected,
} from '../utils/settings'
import * as Styles from 'zosLoader:./debug.[pf].layout.js'

const logger = log.getLogger('linklost-debug')
const MONITOR_SERVICE_FILE = 'app-service/connection-monitor'

let statusWidget
let connectedButton
let disconnectedButton
let detailWidget
let simulatedConnected = true
let transitionInProgress = false

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

function renderSimulationState() {
  if (!statusWidget) {
    return
  }

  statusWidget.setProperty(
    prop.TEXT,
    simulatedConnected ? 'SIMULATED: CONNECTED' : 'SIMULATED: DISCONNECTED',
  )
  statusWidget.setProperty(prop.COLOR, simulatedConnected ? 0x58d68d : 0xff6b7a)
  connectedButton.setProperty(prop.VISIBLE, simulatedConnected)
  disconnectedButton.setProperty(prop.VISIBLE, !simulatedConnected)
}

function stopMonitor(onStopped) {
  if (!isMonitorServiceRunning()) {
    onStopped(true)
    return
  }

  stopAppService({
    file: MONITOR_SERVICE_FILE,
    complete_func: ({ result }) => {
      logger.log(`Monitor stop result: ${result}`)
      onStopped(result)
    },
  })
}

function startMonitor({ debug, onStarted }) {
  const options = {
    file: MONITOR_SERVICE_FILE,
    reload: !debug,
    complete_func: ({ result }) => {
      logger.log(`${debug ? 'Debug' : 'Production'} monitor start result: ${result}`)
      onStarted(result)
    },
  }

  if (debug) {
    options.param = 'mode=debug'
  }

  const errorCode = startAppService(options)
  logger.log(`Monitor start request code: ${errorCode}`)
}

function switchToDebugMonitor() {
  transitionInProgress = true
  setDetail('Starting simulated disconnect...')

  // Only one continuous service is used; Debug supplies a different input value.
  stopMonitor((stopped) => {
    if (!stopped) {
      transitionInProgress = false
      setDetail('Could not stop the production monitor')
      return
    }

    startMonitor({
      debug: true,
      onStarted: (started) => {
        transitionInProgress = false
        if (started) {
          setDetail('Production alert flow is running with test input.')
          return
        }

        simulatedConnected = true
        setDebugSimulatedConnected(true)
        renderSimulationState()
        setDetail('Could not start the Debug monitor')
      },
    })
  })
}

function restoreProductionMonitor() {
  transitionInProgress = true
  setDetail('Restoring the real Bluetooth monitor...')

  stopMonitor((stopped) => {
    if (!stopped) {
      transitionInProgress = false
      setDetail('Could not stop the Debug monitor')
      return
    }

    if (!getMonitoringEnabled()) {
      transitionInProgress = false
      setDetail('Simulation stopped. Real monitoring is disabled.')
      return
    }

    startMonitor({
      debug: false,
      onStarted: (started) => {
        transitionInProgress = false
        setDetail(
          started
            ? 'Simulation stopped. Real monitoring restored.'
            : 'Could not restore the real monitor',
        )
      },
    })
  })
}

function simulateDisconnect() {
  if (!simulatedConnected || transitionInProgress) {
    return
  }

  simulatedConnected = false
  setDebugSimulatedConnected(false)
  renderSimulationState()
  switchToDebugMonitor()
}

function simulateReconnect() {
  if (simulatedConnected || transitionInProgress) {
    return
  }

  // The running controller sees this input during shutdown and performs its
  // normal reconnect cancellation/restoration flow before production restarts.
  simulatedConnected = true
  setDebugSimulatedConnected(true)
  renderSimulationState()
  restoreProductionMonitor()
}

Page({
  onInit() {
    if (!DEBUG_PAGE_ENABLED) {
      back()
      return
    }

    simulatedConnected = getDebugSimulatedConnected()
  },

  build() {
    if (!DEBUG_PAGE_ENABLED) {
      return
    }

    createWidget(widget.TEXT, {
      ...Styles.TITLE_STYLE,
      color: 0xf4bd50,
      text: 'DEBUG SIMULATOR',
      text_size: 30,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
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

    connectedButton = createWidget(widget.BUTTON, {
      ...Styles.TOGGLE_BUTTON_STYLE,
      radius: 66,
      normal_color: 0x21734d,
      press_color: 0x4aa97a,
      color: 0xffffff,
      text: 'SIMULATE\nDISCONNECT',
      text_size: 30,
      click_func: simulateDisconnect,
    })

    disconnectedButton = createWidget(widget.BUTTON, {
      ...Styles.TOGGLE_BUTTON_STYLE,
      radius: 66,
      normal_color: 0xa63737,
      press_color: 0xd86565,
      color: 0xffffff,
      text: 'SIMULATE\nRECONNECT',
      text_size: 30,
      visible: false,
      click_func: simulateReconnect,
    })

    detailWidget = createWidget(widget.TEXT, {
      ...Styles.DETAIL_STYLE,
      color: 0xaec4dc,
      text: 'No real Bluetooth connection is changed.',
      text_size: 17,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
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
    statusWidget = undefined
    connectedButton = undefined
    disconnectedButton = undefined
    detailWidget = undefined
  },
})
