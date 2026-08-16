import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { queryPermission, requestPermission } from '@zos/app'
import { getAllAppServices, start as startAppService } from '@zos/app-service'
import { Vibrator, VIBRATOR_SCENE_NOTIFICATION } from '@zos/sensor'
import { align, createWidget, prop, text_style, widget } from '@zos/ui'
import { log } from '@zos/utils'
import { createConnectionStateMachine } from '../utils/connection-state'
import {
  formatDisconnectDelay,
  getDisconnectDelayMs,
  getNextDisconnectDelayMs,
  setDisconnectDelayMs,
} from '../utils/settings'
import * as Styles from 'zosLoader:./index.[pf].layout.js'

const logger = log.getLogger('linklost')
const vibrator = new Vibrator()
const BACKGROUND_PERMISSION = 'device:os.bg_service'
const BACKGROUND_SERVICE_FILE = 'app-service/connection-monitor'

let statusWidget
let detailWidget
let delayButton
let connectionStateMachine
let backgroundServiceOwnsAlerts = false
let backgroundServiceRequested = false
let pageConnectionListenerRegistered = false

function renderConnectionStatus({ connected, isInitialState, source }) {
  const statusText = connected ? 'CONNECTED' : 'DISCONNECTED'
  const statusColor = connected ? 0x58d68d : 0xff6b7a
  const detailText = connected
    ? 'Monitoring phone connection'
    : 'Phone connection lost'

  logger.log(`${source}: ${statusText}${isInitialState ? ' (initial)' : ''}`)

  if (!statusWidget || !detailWidget) {
    return
  }

  statusWidget.setProperty(prop.TEXT, statusText)
  statusWidget.setProperty(prop.COLOR, statusColor)
  detailWidget.setProperty(prop.TEXT, detailText)
}

function alertOnDisconnect() {
  if (backgroundServiceOwnsAlerts) {
    logger.log('Disconnect alert is owned by the background monitor')
    return
  }

  logger.warn('Connected to disconnected transition detected; vibrating once')
  vibrator.start({ mode: VIBRATOR_SCENE_NOTIFICATION })
}

function handleConnectionChange(status) {
  if (typeof status !== 'boolean') {
    logger.warn('Ignored BLE callback without a boolean connection status')
    return
  }

  connectionStateMachine.update(status)
}

function renderDelaySetting() {
  if (!delayButton) {
    return
  }

  delayButton.setProperty(
    prop.TEXT,
    `Alert delay: ${formatDisconnectDelay(getDisconnectDelayMs())}`,
  )
}

function cycleDisconnectDelay() {
  const currentDelay = getDisconnectDelayMs()
  const nextDelay = getNextDisconnectDelayMs(currentDelay)

  // The service reads this saved value when the next disconnect starts.
  setDisconnectDelayMs(nextDelay)
  renderDelaySetting()
  logger.log(`Disconnect delay changed to ${formatDisconnectDelay(nextDelay)}`)
}

function registerPageConnectionListener() {
  if (pageConnectionListenerRegistered || backgroundServiceOwnsAlerts) {
    return
  }

  createConnect((index, data, size) => {
    logger.debug(`Received foreground companion data: index=${index}, size=${size}`)
  })
  connectionStateMachine.update(connectStatus())
  addListener(handleConnectionChange)
  pageConnectionListenerRegistered = true
  logger.log('Foreground BLE connection listener registered as fallback')
}

function startBackgroundMonitor() {
  if (backgroundServiceRequested || backgroundServiceOwnsAlerts) {
    return
  }

  const runningServices = getAllAppServices()
  const isAlreadyRunning = runningServices.some(
    (service) =>
      service === BACKGROUND_SERVICE_FILE ||
      service === `${BACKGROUND_SERVICE_FILE}.js`,
  )

  if (isAlreadyRunning) {
    backgroundServiceOwnsAlerts = true
    logger.log('Background connection monitor is already running')
    return
  }

  backgroundServiceRequested = true
  const startResult = startAppService({
    file: BACKGROUND_SERVICE_FILE,
    reload: true,
    complete_func: ({ result }) => {
      backgroundServiceOwnsAlerts = result

      if (result) {
        logger.log('Background connection monitor started')
        return
      }

      backgroundServiceRequested = false
      logger.warn('Background connection monitor could not start')
      registerPageConnectionListener()
    },
  })

  logger.log(`Background connection monitor start requested: ${startResult}`)
}

function enableBackgroundMonitor() {
  const permissionStates = queryPermission({
    permissions: [BACKGROUND_PERMISSION],
  })

  if (permissionStates[0] === 2) {
    startBackgroundMonitor()
    return
  }

  requestPermission({
    permissions: [BACKGROUND_PERMISSION],
    callback: (result) => {
      if (result[0] === 2) {
        startBackgroundMonitor()
        return
      }

      logger.warn('Background-monitor permission was not granted')
      registerPageConnectionListener()
    },
  })
}

Page({
  onInit() {
    connectionStateMachine = createConnectionStateMachine({
      onStateChange: renderConnectionStatus,
      onDisconnect: alertOnDisconnect,
    })

    connectionStateMachine.initialize(connectStatus())
    enableBackgroundMonitor()
  },

  build() {
    createWidget(widget.TEXT, {
      ...Styles.TITLE_STYLE,
      color: 0xaec4dc,
      text: 'PHONE CONNECTION',
      text_size: 22,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    statusWidget = createWidget(widget.TEXT, {
      ...Styles.STATUS_STYLE,
      color: 0xffffff,
      text: 'CHECKING...',
      text_size: 40,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    detailWidget = createWidget(widget.TEXT, {
      ...Styles.DETAIL_STYLE,
      color: 0x8ea4ba,
      text: 'Reading connection status',
      text_size: 18,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.WRAP,
    })

    createWidget(widget.TEXT, {
      ...Styles.DELAY_LABEL_STYLE,
      color: 0xaec4dc,
      text: 'ALERT DELAY',
      text_size: 16,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    delayButton = createWidget(widget.BUTTON, {
      ...Styles.DELAY_BUTTON_STYLE,
      radius: 14,
      normal_color: 0x1e5b8f,
      press_color: 0x4a8fc7,
      color: 0xffffff,
      text: 'Alert delay',
      text_size: 19,
      click_func: cycleDisconnectDelay,
    })
    renderDelaySetting()

    // Render the status captured in onInit after the widgets exist.
    const initialStatus = connectionStateMachine.getCurrentState()
    if (typeof initialStatus === 'boolean') {
      renderConnectionStatus({
        connected: initialStatus,
        isInitialState: true,
        source: 'initial-render',
      })
    }
  },

  onDestroy() {
    if (pageConnectionListenerRegistered) {
      removeListener()
      pageConnectionListenerRegistered = false
      logger.log('Foreground BLE connection listener removed')
    }

    if (!backgroundServiceRequested && !backgroundServiceOwnsAlerts) {
      disConnect()
    }
    statusWidget = undefined
    detailWidget = undefined
    delayButton = undefined
    connectionStateMachine = undefined
  },
})
