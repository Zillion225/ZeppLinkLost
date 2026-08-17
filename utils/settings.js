import { localStorage } from '@zos/storage'

export const DISCONNECT_DELAY_OPTIONS_MS = [10000, 15000, 30000, 60000]
export const ALARM_STOP_TIME_OPTIONS_MS = [5000, 10000, 15000, 30000]
export const ALARM_SOUND_OPTIONS = [
  { id: 'alarm', label: 'Alarm', file: 'link-lost-alarm.mp3' },
  { id: 'siren', label: 'Siren', file: 'link-lost-siren.mp3' },
  { id: 'pulse', label: 'Pulse', file: 'link-lost-pulse.mp3' },
]

const DISCONNECT_DELAY_STORAGE_KEY = 'disconnect-delay-ms'
const ALARM_STOP_TIME_STORAGE_KEY = 'alarm-stop-time-ms'
const ALARM_SOUND_STORAGE_KEY = 'alarm-sound-id'
const MONITOR_ENABLED_STORAGE_KEY = 'monitor-enabled'
const VIBRATION_ENABLED_STORAGE_KEY = 'vibration-enabled'
const DEBUG_SIMULATED_CONNECTED_STORAGE_KEY = 'debug-simulated-connected'
// v2 intentionally resets the old implicit mode that could disable real BLE.
const DEBUG_SIMULATION_ACTIVE_STORAGE_KEY = 'debug-mode-enabled-v2'
const DEFAULT_DISCONNECT_DELAY_MS = DISCONNECT_DELAY_OPTIONS_MS[0]
const DEFAULT_ALARM_STOP_TIME_MS = ALARM_STOP_TIME_OPTIONS_MS[1]
const DEFAULT_ALARM_SOUND_ID = ALARM_SOUND_OPTIONS[0].id

function isSupportedDelay(delayMs) {
  return DISCONNECT_DELAY_OPTIONS_MS.includes(delayMs)
}

function isSupportedAlarmStopTime(stopTimeMs) {
  return ALARM_STOP_TIME_OPTIONS_MS.includes(stopTimeMs)
}

function isSupportedAlarmSound(soundId) {
  return ALARM_SOUND_OPTIONS.some((sound) => sound.id === soundId)
}

export function getDisconnectDelayMs() {
  const storedDelay = Number(
    localStorage.getItem(DISCONNECT_DELAY_STORAGE_KEY, DEFAULT_DISCONNECT_DELAY_MS),
  )

  return isSupportedDelay(storedDelay)
    ? storedDelay
    : DEFAULT_DISCONNECT_DELAY_MS
}

export function setDisconnectDelayMs(delayMs) {
  const selectedDelay = isSupportedDelay(delayMs)
    ? delayMs
    : DEFAULT_DISCONNECT_DELAY_MS

  localStorage.setItem(DISCONNECT_DELAY_STORAGE_KEY, selectedDelay)
  return selectedDelay
}

export function getNextDisconnectDelayMs(currentDelayMs) {
  const currentIndex = DISCONNECT_DELAY_OPTIONS_MS.indexOf(currentDelayMs)
  const nextIndex = (currentIndex + 1) % DISCONNECT_DELAY_OPTIONS_MS.length

  return DISCONNECT_DELAY_OPTIONS_MS[nextIndex]
}

export function formatDisconnectDelay(delayMs) {
  return `${delayMs / 1000}s`
}

export function getAlarmStopTimeMs() {
  const storedStopTime = Number(
    localStorage.getItem(ALARM_STOP_TIME_STORAGE_KEY, DEFAULT_ALARM_STOP_TIME_MS),
  )

  return isSupportedAlarmStopTime(storedStopTime)
    ? storedStopTime
    : DEFAULT_ALARM_STOP_TIME_MS
}

export function setAlarmStopTimeMs(stopTimeMs) {
  const selectedStopTime = isSupportedAlarmStopTime(stopTimeMs)
    ? stopTimeMs
    : DEFAULT_ALARM_STOP_TIME_MS

  localStorage.setItem(ALARM_STOP_TIME_STORAGE_KEY, selectedStopTime)
  return selectedStopTime
}

export function getNextAlarmStopTimeMs(currentStopTimeMs) {
  const currentIndex = ALARM_STOP_TIME_OPTIONS_MS.indexOf(currentStopTimeMs)
  const nextIndex = (currentIndex + 1) % ALARM_STOP_TIME_OPTIONS_MS.length

  return ALARM_STOP_TIME_OPTIONS_MS[nextIndex]
}

export function formatAlarmStopTime(stopTimeMs) {
  return `${stopTimeMs / 1000}s`
}

export function getAlarmSound() {
  const storedSoundId = localStorage.getItem(
    ALARM_SOUND_STORAGE_KEY,
    DEFAULT_ALARM_SOUND_ID,
  )

  return (
    ALARM_SOUND_OPTIONS.find((sound) => sound.id === storedSoundId) ||
    ALARM_SOUND_OPTIONS[0]
  )
}

export function setAlarmSound(soundId) {
  const selectedSoundId = isSupportedAlarmSound(soundId)
    ? soundId
    : DEFAULT_ALARM_SOUND_ID

  localStorage.setItem(ALARM_SOUND_STORAGE_KEY, selectedSoundId)
  return selectedSoundId
}

export function getNextAlarmSoundId(currentSoundId) {
  const currentIndex = ALARM_SOUND_OPTIONS.findIndex(
    (sound) => sound.id === currentSoundId,
  )
  const nextIndex = (currentIndex + 1) % ALARM_SOUND_OPTIONS.length

  return ALARM_SOUND_OPTIONS[nextIndex].id
}

export function getMonitoringEnabled() {
  return localStorage.getItem(MONITOR_ENABLED_STORAGE_KEY, 'true') !== 'false'
}

export function setMonitoringEnabled(enabled) {
  localStorage.setItem(MONITOR_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false')
  return enabled
}

export function getVibrationEnabled() {
  return localStorage.getItem(VIBRATION_ENABLED_STORAGE_KEY, 'true') !== 'false'
}

export function setVibrationEnabled(enabled) {
  localStorage.setItem(VIBRATION_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false')
  return enabled
}

export function getDebugSimulatedConnected() {
  return (
    localStorage.getItem(DEBUG_SIMULATED_CONNECTED_STORAGE_KEY, 'true') !== 'false'
  )
}

export function setDebugSimulatedConnected(connected) {
  localStorage.setItem(
    DEBUG_SIMULATED_CONNECTED_STORAGE_KEY,
    connected ? 'true' : 'false',
  )
  return connected
}

export function getDebugSimulationActive() {
  return localStorage.getItem(DEBUG_SIMULATION_ACTIVE_STORAGE_KEY, 'false') === 'true'
}

export function setDebugSimulationActive(active) {
  localStorage.setItem(DEBUG_SIMULATION_ACTIVE_STORAGE_KEY, active ? 'true' : 'false')
  return active
}
