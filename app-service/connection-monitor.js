import {
  addListener,
  connectStatus,
  createConnect,
  disConnect,
  removeListener,
} from '@zos/ble'
import { create as createMediaPlayer, id as mediaId } from '@zos/media'
import { notify } from '@zos/notification'
import {
  SystemSounds,
  Vibrator,
  VIBRATOR_SCENE_TIMER,
} from '@zos/sensor'
import { createSysTimer, stopTimer } from '@zos/timer'
import { log } from '@zos/utils'
import { createAlarmController } from '../core/alarm-controller'
import { createConnectionAlertController } from '../core/connection-alert-controller'
import {
  getAlarmSound,
  getAlarmStopTimeMs,
  getDisconnectDelayMs,
  getVibrationEnabled,
} from '../utils/settings'

const logger = log.getLogger('linklost-service')
const SERVICE_FILE = 'app-service/connection-monitor'

// One App Service owns exactly one instance of every hardware resource.
const systemSounds = new SystemSounds()
const vibrator = new Vibrator()
const alarmPlayer = createMediaPlayer(mediaId.PLAYER)

const scheduler = {
  setTimeout(callback, delayMs) {
    return createSysTimer(false, delayMs, callback)
  },
  clearTimeout(timerId) {
    stopTimer(timerId)
  },
}

let controller
let bleListenerRegistered = false
let vibrationRunning = false
let mediaPlaying = false
let pendingAudioStarted = null
let pendingAudioFailed = null

alarmPlayer.addEventListener(alarmPlayer.event.PREPARE, (ready) => {
  const onStarted = pendingAudioStarted
  const onFailed = pendingAudioFailed
  pendingAudioStarted = null
  pendingAudioFailed = null

  // A reconnect may cancel the alarm while the media file is preparing.
  if (!onStarted && !onFailed) {
    return
  }

  if (!ready) {
    logger.warn('Custom alarm audio could not be prepared')
    if (onFailed) {
      onFailed()
    }
    return
  }

  try {
    alarmPlayer.start()
    mediaPlaying = true
    if (onStarted) {
      onStarted()
    }
  } catch (error) {
    logger.warn(`Custom alarm audio could not start: ${String(error)}`)
    if (onFailed) {
      onFailed()
    }
  }
})

const audio = {
  start(sound, onStarted, onFailed) {
    pendingAudioStarted = onStarted
    pendingAudioFailed = onFailed
    try {
      alarmPlayer.setSource(alarmPlayer.source.FILE, { file: sound.file })
      alarmPlayer.prepare()
    } catch (error) {
      pendingAudioStarted = null
      pendingAudioFailed = null
      logger.warn(`Custom alarm audio setup failed: ${String(error)}`)
      if (onFailed) {
        onFailed()
      }
    }
  },
  stop() {
    pendingAudioStarted = null
    pendingAudioFailed = null
    if (mediaPlaying) {
      alarmPlayer.stop()
    }
    mediaPlaying = false
  },
}

const vibration = {
  start() {
    if (vibrationRunning) {
      vibrator.stop()
    }

    // Follow Zepp's documented alarm-scene sequence. On Active Max, passing a
    // mode to start() can be ignored by the background runtime; setting it first
    // makes the next start() use TIMER until this adapter calls stop().
    vibrator.setMode(VIBRATOR_SCENE_TIMER)
    vibrator.start()
    vibrationRunning = true
    logger.log('Timer alarm vibration started')
  },
  stop() {
    if (vibrationRunning) {
      vibrator.stop()
      logger.log('Continuous alarm vibration stopped')
    }
    vibrationRunning = false
  },
}

const alarm = createAlarmController({ scheduler, audio, vibration, logger })

const notifier = {
  disconnected() {
    const notificationId = notify({
      title: 'Link Lost',
      content: 'LK: Phone connection lost',
      actions: [
        {
          text: 'Stop alarm',
          file: SERVICE_FILE,
          param: 'action=stop-alarm',
        },
      ],
    })
    logger.log(`Disconnect notification result: ${notificationId}`)
    return Boolean(notificationId)
  },

  restored() {
    const notificationId = notify({
      title: 'Link Lost',
      content: 'LK: Phone connection restored',
      actions: [],
    })
    if (notificationId && systemSounds.getEnabled()) {
      systemSounds.start(systemSounds.getSourceType().ACHIEVE)
    }
    logger.log(`Reconnect notification result: ${notificationId}`)
    return Boolean(notificationId)
  },
}

function readConnection() {
  return connectStatus()
}

function handleConnectionChange(status) {
  if (controller && typeof status === 'boolean') {
    controller.updateConnection(status, 'ble-listener')
  }
}

function createController() {
  controller = createConnectionAlertController({
    scheduler,
    settings: {
      getAlarmSound,
      getAlarmStopTimeMs,
      getDisconnectDelayMs,
      getVibrationEnabled,
    },
    connection: { isConnected: readConnection },
    notifier,
    alarm,
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

AppService({
  onInit() {
    logger.log('Singleton connection monitor starting')
    createController()

    createConnect((index, data, size) => {
      logger.debug(`Received companion data: index=${index}, size=${size}`)
    })
    controller.initialize(connectStatus())
    addListener(handleConnectionChange)
    bleListenerRegistered = true
    logger.log('Singleton connection monitor ready')
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
    if (controller) {
      controller.destroy()
      controller = undefined
    }
    if (bleListenerRegistered) {
      removeListener()
      disConnect()
      bleListenerRegistered = false
    }
    logger.log('Singleton connection monitor stopped')
  },
})
