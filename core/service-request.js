/** Zepp App Service requests are accepted only when the immediate result is 0. */
export function isServiceRequestAccepted(result) {
  return Number(result) === 0
}

/** The asynchronous App Service callback reports success as a Boolean. */
export function isServiceStartSuccessful(result) {
  return result === true
}

/** Zepp permission APIs use 2 for an already-granted permission. */
export function isPermissionGranted(result) {
  return Number(result) === 2
}
