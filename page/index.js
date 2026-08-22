import { connectStatus } from '@zos/ble'
import { getPackageInfo, queryPermission, requestPermission } from '@zos/app'
import {
  getAllAppServices,
  start as startAppService,
  stop as stopAppService,
} from '@zos/app-service'
import { SCROLL_MODE_SWIPER, setScrollMode } from '@zos/page'
import { align, createWidget, prop, text_style, widget } from '@zos/ui'
import { log, px } from '@zos/utils'
import { getMonitorStatus, MonitorStatus } from '../core/monitor-status'
import {
  isPermissionGranted,
  isServiceRequestAccepted,
  isServiceStartSuccessful,
} from '../core/service-request'
import {
  formatAlarmStopTime,
  formatDisconnectDelay,
  getAlarmSound,
  getAlarmStopTimeMs,
  getDisconnectDelayMs,
  getMonitoringEnabled,
  getNextAlarmSoundId,
  getNextAlarmStopTimeMs,
  getNextDisconnectDelayMs,
  getVibrationEnabled,
  setAlarmSound,
  setAlarmStopTimeMs,
  setDisconnectDelayMs,
  setMonitoringEnabled,
  setVibrationEnabled,
} from '../utils/settings'
import * as Styles from 'zosLoader:./index.[pf].layout.js'

const logger = log.getLogger('linklost')
const BACKGROUND_PERMISSION = 'device:os.bg_service'
const BACKGROUND_SERVICE_FILE = 'app-service/connection-monitor'
const SCREEN_HEIGHT = 480

let statusWidget
let monitorOnButton
let monitorOffButton
let monitorStartingButton
let monitorUnavailableButton
let delayButton
let stopButton
let soundButton
let vibrationButton
let monitorEnabled = getMonitoringEnabled()
let backgroundServiceOwnsAlerts = false
let backgroundServiceRequested = false
let permissionRequestPending = false

function onScreen(style, screenIndex) {
  return {
    ...style,
    y: style.y + px(SCREEN_HEIGHT * screenIndex),
  }
}

function getInstalledAppVersion() {
  try {
    const packageInfo = getPackageInfo()
    const version = packageInfo && packageInfo.version

    if (version && typeof version.name === 'string') {
      return version.name
    }
    if (typeof version === 'string') {
      return version
    }
  } catch (error) {
    logger.warn(`Could not read installed app version: ${String(error)}`)
  }

  return 'Unknown'
}

function isBackgroundMonitorRunning() {
  return getAllAppServices().some(
    (service) =>
      service === BACKGROUND_SERVICE_FILE ||
      service === `${BACKGROUND_SERVICE_FILE}.js`,
  )
}

function renderMonitorButton() {
  if (
    !monitorOnButton ||
    !monitorOffButton ||
    !monitorStartingButton ||
    !monitorUnavailableButton
  ) {
    return
  }

  const monitorStatus = getMonitorStatus({
    enabled: monitorEnabled,
    serviceActive: backgroundServiceOwnsAlerts,
    serviceStartPending: backgroundServiceRequested,
    permissionPending: permissionRequestPending,
  })

  monitorOnButton.setProperty(prop.VISIBLE, monitorStatus === MonitorStatus.ACTIVE)
  monitorOffButton.setProperty(prop.VISIBLE, monitorStatus === MonitorStatus.OFF)
  monitorStartingButton.setProperty(
    prop.VISIBLE,
    monitorStatus === MonitorStatus.STARTING,
  )
  monitorUnavailableButton.setProperty(
    prop.VISIBLE,
    monitorStatus === MonitorStatus.UNAVAILABLE,
  )
}

function renderConnectionStatus({ connected, isInitialState, source }) {
  const statusText = connected ? 'CONNECTED' : 'DISCONNECTED'
  const statusColor = connected ? 0x58d68d : 0xff6b7a
  logger.log(`${source}: ${statusText}${isInitialState ? ' (initial)' : ''}`)

  if (!statusWidget) {
    return
  }

  statusWidget.setProperty(prop.TEXT, statusText)
  statusWidget.setProperty(prop.COLOR, statusColor)
}

function refreshConnectionStatus() {
  renderConnectionStatus({
    connected: connectStatus(),
    isInitialState: false,
    source: 'status-refresh',
  })
}

function stopBackgroundMonitor() {
  if (!isBackgroundMonitorRunning()) {
    backgroundServiceOwnsAlerts = false
    renderMonitorButton()
    return
  }

  const stopResult = stopAppService({
    file: BACKGROUND_SERVICE_FILE,
    complete_func: ({ result }) => {
      backgroundServiceOwnsAlerts = false
      backgroundServiceRequested = false
      logger.log(`Background connection monitor stopped: ${result}`)
      renderMonitorButton()

      if (monitorEnabled) {
        enableBackgroundMonitor()
      }
    },
  })

  if (!isServiceRequestAccepted(stopResult)) {
    logger.warn(`Background monitor stop rejected: ${stopResult}`)
  }
}

function startBackgroundMonitor() {
  if (!monitorEnabled || backgroundServiceRequested || backgroundServiceOwnsAlerts) {
    return
  }

  if (isBackgroundMonitorRunning()) {
    backgroundServiceOwnsAlerts = true
    logger.log('Background connection monitor is already running')
    renderMonitorButton()
    return
  }

  backgroundServiceRequested = true
  renderMonitorButton()
  const startResult = startAppService({
    file: BACKGROUND_SERVICE_FILE,
    reload: true,
    complete_func: ({ result }) => {
      backgroundServiceRequested = false
      const didStart = isServiceStartSuccessful(result)

      if (!monitorEnabled) {
        if (didStart) {
          stopBackgroundMonitor()
        }
        return
      }

      backgroundServiceOwnsAlerts = didStart
      if (didStart) {
        logger.log('Background connection monitor started')
        renderMonitorButton()
        return
      }

      // No foreground alert fallback exists: it cannot keep monitoring after
      // the page closes. Report the failure instead of claiming monitoring ON.
      logger.warn('Background connection monitor could not start')
      renderMonitorButton()
    },
  })

  logger.log(`Background connection monitor start requested: ${startResult}`)
  if (!isServiceRequestAccepted(startResult)) {
    // An immediate rejection may not invoke complete_func; release the latch so
    // the page can retry instead of remaining permanently stuck.
    backgroundServiceRequested = false
    backgroundServiceOwnsAlerts = false
    logger.warn(`Background monitor start rejected: ${startResult}`)
    renderMonitorButton()
  }
}

function enableBackgroundMonitor() {
  const permissionStates = queryPermission({
    permissions: [BACKGROUND_PERMISSION],
  })
  logger.log(`Background-monitor permission status: ${permissionStates[0]}`)

  if (isPermissionGranted(permissionStates[0])) {
    startBackgroundMonitor()
    return
  }

  permissionRequestPending = true
  renderMonitorButton()
  const permissionRequestResult = requestPermission({
    permissions: [BACKGROUND_PERMISSION],
    callback: (result) => {
      permissionRequestPending = false
      logger.log(`Background-monitor permission callback: ${result[0]}`)
      if (isPermissionGranted(result[0])) {
        startBackgroundMonitor()
        return
      }

      logger.warn('Background-monitor permission was not granted')
      renderMonitorButton()
    },
  })
  logger.log(`Background-monitor permission request: ${permissionRequestResult}`)

  // Zepp may grant this request synchronously and omit the callback. This is
  // common immediately after installing an app, so start monitoring here too.
  if (isPermissionGranted(permissionRequestResult)) {
    permissionRequestPending = false
    logger.log('Background-monitor permission already granted')
    startBackgroundMonitor()
  } else if (permissionRequestResult === 1) {
    permissionRequestPending = false
    logger.warn('Background-monitor permission request is unavailable')
    renderMonitorButton()
  }
}

function retryBackgroundMonitor() {
  if (!monitorEnabled) {
    return
  }

  logger.log('Retrying background connection monitor')
  enableBackgroundMonitor()
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

  stopBackgroundMonitor()
  logger.log('Connection monitor disabled by the user')
}

function renderDelaySetting() {
  const currentDelay = getDisconnectDelayMs()

  delayButton.setProperty(prop.TEXT, formatDisconnectDelay(currentDelay))
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

  stopButton.setProperty(prop.TEXT, formatAlarmStopTime(currentStopTime))
}

function cycleStopTime() {
  const nextStopTime = getNextAlarmStopTimeMs(getAlarmStopTimeMs())

  setAlarmStopTimeMs(nextStopTime)
  renderStopSetting()
  logger.log(`Alarm auto-stop changed to ${formatAlarmStopTime(nextStopTime)}`)
}

function renderSoundSetting() {
  const currentSound = getAlarmSound()

  soundButton.setProperty(prop.TEXT, currentSound.label)
}

function cycleSound() {
  const nextSoundId = getNextAlarmSoundId(getAlarmSound().id)

  setAlarmSound(nextSoundId)
  renderSoundSetting()
  logger.log(`Alarm sound changed to ${getAlarmSound().label}`)
}

function renderVibrationSetting() {
  vibrationButton.setProperty(prop.TEXT, getVibrationEnabled() ? 'ON' : 'OFF')
}

function toggleVibration() {
  const nextState = !getVibrationEnabled()

  setVibrationEnabled(nextState)
  renderVibrationSetting()
  logger.log(`Alarm vibration changed to ${nextState ? 'ON' : 'OFF'}`)
}

function buildSettingScreen({
  screenIndex,
  title,
  color,
  buttonColor,
  buttonPressColor,
  onButtonReady,
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

  const actionButton = createWidget(widget.BUTTON, {
    ...onScreen(Styles.SETTING_BUTTON_STYLE, screenIndex),
    radius: 65,
    normal_color: buttonColor,
    press_color: buttonPressColor,
    color: 0xffffff,
    text: '--',
    text_size: title === 'ALARM SOUND' ? 52 : 58,
    click_func: onPress,
  })

  createWidget(widget.TEXT, {
    ...onScreen(Styles.SETTING_HINT_STYLE, screenIndex),
    color: 0x8ea4ba,
    text: 'Tap the oval to choose next',
    text_size: 17,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
  })

  onButtonReady(actionButton)
}

function buildAboutScreen() {
  createWidget(widget.TEXT, {
    ...onScreen(Styles.ABOUT_TITLE_STYLE, 5),
    color: 0xaec4dc,
    text: 'LINK LOST',
    text_size: 32,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
  })

  // Use the packaged icon so this page always matches the installed app icon.
  createWidget(widget.IMG, {
    ...onScreen(Styles.ABOUT_ICON_STYLE, 5),
    src: 'icon.png',
  })

  createWidget(widget.TEXT, {
    ...onScreen(Styles.ABOUT_VERSION_STYLE, 5),
    color: 0xffffff,
    text: `Version ${getInstalledAppVersion()}`,
    text_size: 25,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
  })

  createWidget(widget.TEXT, {
    ...onScreen(Styles.ABOUT_HINT_STYLE, 5),
    color: 0x8ea4ba,
    text: 'Bluetooth connection monitor',
    text_size: 17,
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
  })
}

Page({
  onInit() {
    renderConnectionStatus({
      connected: connectStatus(),
      isInitialState: true,
      source: 'initial-read',
    })
    if (monitorEnabled) {
      enableBackgroundMonitor()
    }
  },

  build() {
    setScrollMode({
      mode: SCROLL_MODE_SWIPER,
      options: {
        height: SCREEN_HEIGHT,
        count: 6,
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

    monitorOnButton = createWidget(widget.BUTTON, {
      ...Styles.MONITOR_BUTTON_STYLE,
      radius: 63,
      normal_color: 0x21734d,
      press_color: 0x4aa97a,
      color: 0xffffff,
      text: 'MONITORING ON',
      text_size: 30,
      visible: false,
      click_func: toggleMonitor,
    })

    monitorOffButton = createWidget(widget.BUTTON, {
      ...Styles.MONITOR_BUTTON_STYLE,
      radius: 63,
      normal_color: 0xa63737,
      press_color: 0xd86565,
      color: 0xffffff,
      text: 'NOT MONITORING',
      text_size: 30,
      visible: false,
      click_func: toggleMonitor,
    })

    monitorStartingButton = createWidget(widget.BUTTON, {
      ...Styles.MONITOR_BUTTON_STYLE,
      radius: 63,
      normal_color: 0x946b22,
      press_color: 0x946b22,
      color: 0xffffff,
      text: 'MONITOR STARTING',
      text_size: 29,
      visible: false,
    })

    monitorUnavailableButton = createWidget(widget.BUTTON, {
      ...Styles.MONITOR_BUTTON_STYLE,
      radius: 63,
      normal_color: 0x8f3c35,
      press_color: 0xc35f53,
      color: 0xffffff,
      text: 'MONITOR UNAVAILABLE',
      text_size: 26,
      visible: false,
      click_func: retryBackgroundMonitor,
    })
    renderMonitorButton()

    createWidget(widget.TEXT, {
      ...Styles.SWIPE_HINT_STYLE,
      color: 0x8ea4ba,
      text: 'Swipe up for settings',
      text_size: 17,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
    })

    buildSettingScreen({
      screenIndex: 1,
      title: 'ALERT DELAY',
      color: 0x59d98e,
      buttonColor: 0x1e5b8f,
      buttonPressColor: 0x4a8fc7,
      onButtonReady: (button) => {
        delayButton = button
      },
      onPress: cycleDelay,
    })

    buildSettingScreen({
      screenIndex: 2,
      title: 'ALARM AUTO-STOP',
      color: 0xd0b3f5,
      buttonColor: 0x754a9e,
      buttonPressColor: 0x9c73c6,
      onButtonReady: (button) => {
        stopButton = button
      },
      onPress: cycleStopTime,
    })

    buildSettingScreen({
      screenIndex: 3,
      title: 'ALARM SOUND',
      color: 0xf0c1a9,
      buttonColor: 0xa25735,
      buttonPressColor: 0xd48762,
      onButtonReady: (button) => {
        soundButton = button
      },
      onPress: cycleSound,
    })

    buildSettingScreen({
      screenIndex: 4,
      title: 'ALARM VIBRATION',
      color: 0x8fd9ec,
      buttonColor: 0x25758d,
      buttonPressColor: 0x53a9c4,
      onButtonReady: (button) => {
        vibrationButton = button
      },
      onPress: toggleVibration,
    })

    buildAboutScreen()

    renderDelaySetting()
    renderStopSetting()
    renderSoundSetting()
    renderVibrationSetting()
    refreshConnectionStatus()
  },

  onDestroy() {
    statusWidget = undefined
    monitorOnButton = undefined
    monitorOffButton = undefined
    monitorStartingButton = undefined
    monitorUnavailableButton = undefined
    delayButton = undefined
    stopButton = undefined
    soundButton = undefined
    vibrationButton = undefined
  },
})
