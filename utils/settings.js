import { localStorage } from '@zos/storage'

export const DISCONNECT_DELAY_OPTIONS_MS = [10000, 15000, 30000, 60000]

const DISCONNECT_DELAY_STORAGE_KEY = 'disconnect-delay-ms'
const DEFAULT_DISCONNECT_DELAY_MS = DISCONNECT_DELAY_OPTIONS_MS[0]

function isSupportedDelay(delayMs) {
  return DISCONNECT_DELAY_OPTIONS_MS.includes(delayMs)
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
