/**
 * Converts developer-controlled values into normal connection transitions.
 * Storage and the real Bluetooth reader are injected for deterministic tests.
 */
export function createDebugConnectionInput({
  controller,
  readActive,
  readSimulatedConnected,
  readActualConnected,
}) {
  let active = false

  function poll() {
    const nextActive = readActive()

    if (nextActive) {
      const simulatedConnected = readSimulatedConnected()

      // Every Debug session begins from a connected baseline so DISCONNECTED
      // always represents a real transition and arms the production delay.
      if (!active) {
        controller.updateConnection(true, 'debug-baseline')
      }
      controller.updateConnection(simulatedConnected, 'debug-input')
    } else if (active) {
      controller.updateConnection(readActualConnected(), 'debug-ended')
    }

    active = nextActive
    return active
  }

  return {
    poll,
    isActive() {
      return active
    },
  }
}
