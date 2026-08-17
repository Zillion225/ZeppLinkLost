import {
  getAllAppServices,
  start as startAppService,
} from '@zos/app-service'
import { back } from '@zos/router'
import { align, createWidget, prop, text_style, widget } from '@zos/ui'
import { log } from '@zos/utils'
import { DEBUG_PAGE_ENABLED } from '../utils/developer'
import {
  getMonitoringEnabled,
  setDebugSimulatedConnected,
  setDebugSimulationActive,
} from '../utils/settings'
import * as Styles from 'zosLoader:./debug.[pf].layout.js'

const logger = log.getLogger('linklost-debug')
const MONITOR_SERVICE_FILE = 'app-service/connection-monitor'

let statusWidget
let connectedButton
let disconnectedButton
let detailWidget
let simulatedConnected = true

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

function ensureMonitorService() {
  if (isMonitorServiceRunning()) {
    return
  }

  const errorCode = startAppService({
    file: MONITOR_SERVICE_FILE,
    reload: getMonitoringEnabled(),
    complete_func: ({ result }) => {
      logger.log(`Debug monitor start result: ${result}`)
      setDetail(
        result
          ? 'Debug input is ready.'
          : 'Could not start the connection monitor',
      )
    },
  })
  logger.log(`Debug monitor start request code: ${errorCode}`)
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

function simulateDisconnect() {
  if (!simulatedConnected) {
    return
  }

  simulatedConnected = false
  setDebugSimulatedConnected(false)
  renderSimulationState()
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
  setDetail('Simulated connection restored.')
  logger.log('Debug input changed to CONNECTED')
}

Page({
  onInit() {
    if (!DEBUG_PAGE_ENABLED) {
      back()
      return
    }

    // The running App Service polls these developer-only input values.
    simulatedConnected = true
    setDebugSimulatedConnected(true)
    setDebugSimulationActive(true)
    ensureMonitorService()
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
      text: 'Tap the button to supply a test connection value.',
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
    // Returning to the app restores the actual Bluetooth input automatically.
    setDebugSimulationActive(false)
    statusWidget = undefined
    connectedButton = undefined
    disconnectedButton = undefined
    detailWidget = undefined
  },
})
