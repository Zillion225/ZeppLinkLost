/**
 * Tracks phone-connection transitions independently from the page UI.
 *
 * The initial status only establishes a baseline. A disconnect alert can occur
 * only after a previously known connected state changes to disconnected.
 */
export function createConnectionStateMachine({ onStateChange, onDisconnect } = {}) {
  let previousConnectedState = null

  const notifyStateChange = onStateChange || (() => {})
  const notifyDisconnect = onDisconnect || (() => {})

  function applyStatus(status, source) {
    if (typeof status !== 'boolean') {
      return false
    }

    const isInitialState = previousConnectedState === null
    const didChange = previousConnectedState !== status
    const didDisconnect = previousConnectedState === true && status === false

    previousConnectedState = status

    if (isInitialState || didChange) {
      notifyStateChange({
        connected: status,
        isInitialState,
        source,
      })
    }

    if (didDisconnect) {
      notifyDisconnect()
    }

    return didChange
  }

  return {
    initialize(status) {
      return applyStatus(status, 'initial-read')
    },

    update(status) {
      return applyStatus(status, 'ble-listener')
    },

    getCurrentState() {
      return previousConnectedState
    },
  }
}
