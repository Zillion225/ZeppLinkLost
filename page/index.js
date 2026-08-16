import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { queryPermission, requestPermission } from '@zos/app'
import {
  getAllAppServices,
  start as startAppService,
  stop as stopAppService,
} from '@zos/app-service'
import { SCROLL_MODE_SWIPER, setScrollMode } from '@zos/page'
import { Vibrator, VIBRATOR_SCENE_NOTIFICATION } from '@zos/sensor'
import { align, createWidget, prop, text_style, widget } from '@zos/ui'
import { log, px } from '@zos/utils'
import { createConnectionStateMachine } from '../utils/connection-state'
import {
  ALARM_SOUND_OPTIONS,
  formatAlarmStopTime,
  formatDisconnectDelay,
  getAlarmSound,
  getAlarmStopTimeMs,
  getDisconnectDelayMs,
  getMonitoringEnabled,
  getNextAlarmSoundId,
  getNextAlarmStopTimeMs,
  getNextDisconnectDelayMs,
  setAlarmSound,
  setAlarmStopTimeMs,
  setDisconnectDelayMs,
  setMonitoringEnabled,
} from '../utils/settings'
import * as Styles from 'zosLoader:./index.[pf].layout.js'

const logger = log.getLogger('linklost')
const vibrator = new Vibrator()
const BACKGROUND_PERMISSION = 'device:os.bg_service'
const BACKGROUND_SERVICE_FILE = 'app-service/connection-monitor'
const SCREEN_HEIGHT = 480

let statusWidget
let detailWidget
let monitorButton
let delayValueWidget
let delayActionButton
let stopValueWidget
let stopActionButton
let soundValueWidget
let soundActionButton
let connectionStateMachine
let monitorEnabled = getMonitoringEnabled()
let backgroundServiceOwnsAlerts = false
let backgroundServiceRequested = false
let pageConnectionListenerRegistered = false

function onScreen(style, screenIndex) {
  return {
    ...style,
    y: style.y + px(SCREEN_HEIGHT * screenIndex),
  }
}

function isBackgroundMonitorRunning() {
  return getAllAppServices().some(
    (service) =>
      service === BACKGROUND_SERVICE_FILE ||
      service === `${BACKGROUND_SERVICE_FILE}.js`,
  )
}

function renderMonitorButton() {
  if (!monitorButton) {
    return
  }

  monitorButton.setProperty(
    prop.TEXT,
    monitorEnabled ? 'MONITOR: ON' : 'MONITOR: OFF',
  )
}

function renderConnectionStatus({ connected, isInitialState, source }) {
  const statusText = connected ? 'CONNECTED' : 'DISCONNECTED'
  const statusColor = connected ? 0x58d68d : 0xff6b7a
  const detailText = monitorEnabled ? 'Monitor is active' : 'Monitor is turned off'

  logger.log(`${source}: ${statusText}${isInitialState ? ' (initial)' : ''}`)

  if (!statusWidget || !detailWidget) {
    return
  }

  statusWidget.setProperty(prop.TEXT, statusText)
  statusWidget.setProperty(prop.COLOR, statusColor)
  detailWidget.setProperty(prop.TEXT, detailText)
}

function refreshConnectionStatus() {
  const currentState = connectionStateMachine.getCurrentState()
  if (typeof currentState === 'boolean') {
    renderConnectionStatus({
      connected: currentState,
      isInitialState: false,
      source: 'monitor-toggle',
    })
  }
}

function alertOnDisconnect() {
  if (!monitorEnabled || backgroundServiceOwnsAlerts) {
    logger.log('Disconnect alert is owned by the background monitor or disabled')
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

function removePageConnectionListener() {
  if (!pageConnectionListenerRegistered) {
    return
  }

  removeListener()
  pageConnectionListenerRegistered = false
  logger.log('Foreground BLE connection listener removed')
}

function registerPageConnectionListener() {
  if (!monitorEnabled || pageConnectionListenerRegistered || backgroundServiceOwnsAlerts) {
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

function stopBackgroundMonitor() {
  if (!isBackgroundMonitorRunning()) {
    backgroundServiceOwnsAlerts = false
    return
  }

  stopAppService({
    file: BACKGROUND_SERVICE_FILE,
    complete_func: ({ result }) => {
      backgroundServiceOwnsAlerts = false
      backgroundServiceRequested = false
      logger.log(`Background connection monitor stopped: ${result}`)

      if (monitorEnabled) {
        enableBackgroundMonitor()
      }
    },
  })
}

function startBackgroundMonitor() {
  if (!monitorEnabled || backgroundServiceRequested || backgroundServiceOwnsAlerts) {
    return
  }

  if (isBackgroundMonitorRunning()) {
    backgroundServiceOwnsAlerts = true
    logger.log('Background connection monitor is already running')
    return
  }

  backgroundServiceRequested = true
  const startResult = startAppService({
    file: BACKGROUND_SERVICE_FILE,
    reload: true,
    complete_func: ({ result }) => {
      backgroundServiceRequested = false

      if (!monitorEnabled) {
        if (result) {
          stopBackgroundMonitor()
        }
        return
      }

      backgroundServiceOwnsAlerts = result
      if (result) {
        logger.log('Background connection monitor started')
        return
      }

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

function toggleMonitor() {
  monitorEnabled = !monitorEnabled
  setMonitoringEnabled(monitorEnabled)
  renderMonitorButton()
  refreshConnectionStatus()

  if (monitorEnabled) {
    enableBackgroundMonitor()
    return
  }

  removePageConnectionListener()
  stopBackgroundMonitor()
  logger.log('Connection monitor disabled by the user')
}

function renderDelaySetting() {
  const currentDelay = getDisconnectDelayMs()
  const nextDelay = getNextDisconnectDelayMs(currentDelay)

  delayValueWidget.setProperty(prop.TEXT, formatDisconnectDelay(currentDelay))
  delayActionButton.setProperty(prop.TEXT, `Next: ${formatDisconnectDelay(nextDelay)}`)
}

function cycleDelay() {
  const nextDelay = getNextDisconnectDelayMs(getDisconnectDelayMs())

  // The background monitor reads this saved value when the next disconnect starts.
  setDisconnectDelayMs(nextDelay)
  renderDelaySetting()
  logger.log(`Disconnect delay changed to ${formatDisconnectDelay(nextDelay)}`)
}

function renderStopSetting() {
  const currentStopTime = getAlarmStopTimeMs()
  const nextStopTime = getNextAlarmStopTimeMs(currentStopTime)

  stopValueWidget.setProperty(prop.TEXT, formatAlarmStopTime(currentStopTime))
  stopActionButton.setProperty(prop.TEXT, `Next: ${formatAlarmStopTime(nextStopTime)}`)
}

function cycleStopTime() {
  const nextStopTime = getNextAlarmStopTimeMs(getAlarmStopTimeMs())

  setAlarmStopTimeMs(nextStopTime)
  renderStopSetting()
  logger.log(`Alarm auto-stop changed to ${formatAlarmStopTime(nextStopTime)}`)
}

function renderSoundSetting() {
  const currentSound = getAlarmSound()
  const nextSoundId = getNextAlarmSoundId(currentSound.id)
  const nextSound =
    ALARM_SOUND_OPTIONS.find((sound) => sound.id === nextSoundId) ||
    ALARM_SOUND_OPTIONS[0]

  soundValueWidget.setProperty(prop.TEXT, currentSound.label)
  soundActionButton.setProperty(prop.TEXT, `Next: ${nextSound.label}`)
}

function cycleSound() {
  const nextSoundId = getNextAlarmSoundId(getAlarmSound().id)

  setAlarmSound(nextSoundId)
  renderSoundSetting()
  logger.log(`Alarm sound changed to ${getAlarmSound().label}`)
}

function buildSettingScreen({
  screenIndex,
  title,
  instruction,
  color,
  buttonColor,
  buttonPressColor,
  onValueWidgetsReady,
  onPress,
}) {
  createWidget(widget.TEXT, {
    ...onScreen(Styles.SETTING_TITLE_STYLE, screenIndex),
    color,
    text: title,
    text_size: 28,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
  })

  createWidget(widget.TEXT, {
    ...onScreen(Styles.SETTING_INSTRUCTION_STYLE, screenIndex),
    color: 0xc6d5e3,
    text: instruction,
    text_size: 19,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
  })

  const valueWidget = createWidget(widget.TEXT, {
    ...onScreen(Styles.SETTING_VALUE_STYLE, screenIndex),
    color,
    text: '--',
    text_size: title === 'ALARM SOUND' ? 52 : 58,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
  })

  const actionButton = createWidget(widget.BUTTON, {
    ...onScreen(Styles.SETTING_BUTTON_STYLE, screenIndex),
    radius: 16,
    normal_color: buttonColor,
    press_color: buttonPressColor,
    color: 0xffffff,
    text: 'Next',
    text_size: 26,
    click_func: onPress,
  })

  createWidget(widget.TEXT, {
    ...onScreen(Styles.SETTING_HINT_STYLE, screenIndex),
    color: 0x8ea4ba,
    text: 'Tap button to change',
    text_size: 17,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
  })

  onValueWidgetsReady(valueWidget, actionButton)
}

Page({
  onInit() {
    connectionStateMachine = createConnectionStateMachine({
      onStateChange: renderConnectionStatus,
      onDisconnect: alertOnDisconnect,
    })

    connectionStateMachine.initialize(connectStatus())
    if (monitorEnabled) {
      enableBackgroundMonitor()
    }
  },

  build() {
    setScrollMode({
      mode: SCROLL_MODE_SWIPER,
      options: {
        height: SCREEN_HEIGHT,
        count: 4,
        modeParams: {
          crown_enable: true,
          on_page: (pageIndex) => logger.log(`Settings screen: ${pageIndex}`),
        },
      },
    })

    createWidget(widget.TEXT, {
      ...Styles.MAIN_TITLE_STYLE,
      color: 0xaec4dc,
      text: 'PHONE CONNECTION',
      text_size: 26,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    statusWidget = createWidget(widget.TEXT, {
      ...Styles.MAIN_STATUS_STYLE,
      color: 0xffffff,
      text: 'CHECKING...',
      text_size: 42,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    detailWidget = createWidget(widget.TEXT, {
      ...Styles.MAIN_DETAIL_STYLE,
      color: 0x8ea4ba,
      text: 'Reading connection status',
      text_size: 20,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.WRAP,
    })

    createWidget(widget.TEXT, {
      ...Styles.MONITOR_LABEL_STYLE,
      color: 0xaec4dc,
      text: 'CONNECTION MONITOR',
      text_size: 20,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    monitorButton = createWidget(widget.BUTTON, {
      ...Styles.MONITOR_BUTTON_STYLE,
      radius: 16,
      normal_color: 0x21734d,
      press_color: 0x4aa97a,
      color: 0xffffff,
      text: 'MONITOR',
      text_size: 28,
      click_func: toggleMonitor,
    })
    renderMonitorButton()

    createWidget(widget.TEXT, {
      ...Styles.SWIPE_HINT_STYLE,
      color: 0x8ea4ba,
      text: 'Swipe for settings',
      text_size: 17,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    buildSettingScreen({
      screenIndex: 1,
      title: 'ALERT DELAY',
      instruction: 'Wait after disconnection',
      color: 0x59d98e,
      buttonColor: 0x1e5b8f,
      buttonPressColor: 0x4a8fc7,
      onValueWidgetsReady: (value, button) => {
        delayValueWidget = value
        delayActionButton = button
      },
      onPress: cycleDelay,
    })

    buildSettingScreen({
      screenIndex: 2,
      title: 'ALARM AUTO-STOP',
      instruction: 'Stop alarm after',
      color: 0xd0b3f5,
      buttonColor: 0x754a9e,
      buttonPressColor: 0x9c73c6,
      onValueWidgetsReady: (value, button) => {
        stopValueWidget = value
        stopActionButton = button
      },
      onPress: cycleStopTime,
    })

    buildSettingScreen({
      screenIndex: 3,
      title: 'ALARM SOUND',
      instruction: 'Choose alarm tone',
      color: 0xf0c1a9,
      buttonColor: 0xa25735,
      buttonPressColor: 0xd48762,
      onValueWidgetsReady: (value, button) => {
        soundValueWidget = value
        soundActionButton = button
      },
      onPress: cycleSound,
    })

    renderDelaySetting()
    renderStopSetting()
    renderSoundSetting()
    refreshConnectionStatus()
  },

  onDestroy() {
    removePageConnectionListener()

    if (!backgroundServiceRequested && !backgroundServiceOwnsAlerts) {
      disConnect()
    }
    statusWidget = undefined
    detailWidget = undefined
    monitorButton = undefined
    delayValueWidget = undefined
    delayActionButton = undefined
    stopValueWidget = undefined
    stopActionButton = undefined
    soundValueWidget = undefined
    soundActionButton = undefined
    connectionStateMachine = undefined
  },
})
