import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { Vibrator, VIBRATOR_SCENE_NOTIFICATION } from '@zos/sensor'
import { align, createWidget, prop, text_style, widget } from '@zos/ui'
import { log } from '@zos/utils'
import { createConnectionStateMachine } from '../utils/connection-state'
import * as Styles from 'zosLoader:./index.[pf].layout.js'

const logger = log.getLogger('linklost')
const vibrator = new Vibrator()

let statusWidget
let detailWidget
let connectionStateMachine

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

Page({
  onInit() {
    connectionStateMachine = createConnectionStateMachine({
      onStateChange: renderConnectionStatus,
      onDisconnect: alertOnDisconnect,
    })

    createConnect((index, data, size) => {
      logger.debug(`Received companion data: index=${index}, size=${size}`)
    })
    connectionStateMachine.initialize(connectStatus())
    addListener(handleConnectionChange)
    logger.log('BLE connection listener registered')
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
    removeListener()
    disConnect()
    statusWidget = undefined
    detailWidget = undefined
    connectionStateMachine = undefined
    logger.log('BLE connection listener removed')
  },
})
