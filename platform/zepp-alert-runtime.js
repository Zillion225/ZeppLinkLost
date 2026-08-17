import { create as createMediaPlayer, id as mediaId } from '@zos/media'
import { notify } from '@zos/notification'
import {
  SystemSounds,
  Vibrator,
  VIBRATOR_SCENE_TIMER,
} from '@zos/sensor'
import { createSysTimer, stopTimer } from '@zos/timer'
import { createAlarmController } from '../core/alarm-controller'

export function createZeppScheduler() {
  return {
    setTimeout(callback, delayMs) {
      return createSysTimer(false, delayMs, callback)
    },
    clearTimeout(timerId) {
      stopTimer(timerId)
    },
  }
}

function createAudioAdapter() {
  const player = createMediaPlayer(mediaId.PLAYER)
  let pendingStartedCallback = null
  let pendingFailedCallback = null
  let playing = false

  player.addEventListener(player.event.PREPARE, (ready) => {
    const onStarted = pendingStartedCallback
    const onFailed = pendingFailedCallback
    pendingStartedCallback = null
    pendingFailedCallback = null

    // The alarm may have been cancelled while the player was preparing.
    if (!onStarted && !onFailed) {
      return
    }

    if (!ready) {
      if (onFailed) {
        onFailed()
      }
      return
    }

    player.start()
    playing = true
    if (onStarted) {
      onStarted()
    }
  })

  return {
    start(sound, onStarted, onFailed) {
      pendingStartedCallback = onStarted
      pendingFailedCallback = onFailed
      player.setSource(player.source.FILE, { file: sound.file })
      player.prepare()
    },
    stop() {
      pendingStartedCallback = null
      pendingFailedCallback = null
      if (playing) {
        player.stop()
      }
      playing = false
    },
  }
}

function createVibrationAdapter() {
  const vibrator = new Vibrator()
  let running = false

  return {
    start() {
      // TIMER is the watch's continuous alarm vibration and requires manual stop.
      vibrator.stop()
      vibrator.start({ mode: VIBRATOR_SCENE_TIMER })
      running = true
    },
    stop() {
      if (running) {
        vibrator.stop()
      }
      running = false
    },
  }
}

function createNotifier({ debug, serviceFile, logger }) {
  const systemSounds = new SystemSounds()
  const title = debug ? 'Link Lost (Debug)' : 'Link Lost'
  const prefix = debug ? 'LK: Simulated phone connection' : 'LK: Phone connection'

  return {
    disconnected() {
      const notificationId = notify({
        title,
        content: `${prefix} lost`,
        actions: [
          {
            text: 'Stop alarm',
            file: serviceFile,
            param: 'action=stop-alarm',
          },
        ],
      })
      logger.log(`Disconnect notification result: ${notificationId}`)
      return Boolean(notificationId)
    },

    restored() {
      const notificationId = notify({
        title,
        content: `${prefix} restored`,
        actions: [],
      })
      if (notificationId && systemSounds.getEnabled()) {
        systemSounds.start(systemSounds.getSourceType().ACHIEVE)
      }
      logger.log(`Reconnect notification result: ${notificationId}`)
      return Boolean(notificationId)
    },
  }
}

export function createZeppAlertRuntime({ debug, serviceFile, logger }) {
  const scheduler = createZeppScheduler()
  const alarm = createAlarmController({
    scheduler,
    audio: createAudioAdapter(),
    vibration: createVibrationAdapter(),
    logger,
  })

  return {
    scheduler,
    alarm,
    notifier: createNotifier({ debug, serviceFile, logger }),
  }
}
