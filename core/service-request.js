/** Zepp App Service requests are accepted only when the immediate result is 0. */
export function isServiceRequestAccepted(result) {
  return Number(result) === 0
}
