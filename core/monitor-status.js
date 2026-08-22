export const MonitorStatus = Object.freeze({
  ACTIVE: 'active',
  OFF: 'off',
  STARTING: 'starting',
  UNAVAILABLE: 'unavailable',
})

/** Maps the persisted preference and real service state to honest UI wording. */
export function getMonitorStatus({
  enabled,
  serviceActive,
  serviceStartPending,
  permissionPending,
}) {
  if (!enabled) {
    return MonitorStatus.OFF
  }
  if (serviceActive) {
    return MonitorStatus.ACTIVE
  }
  if (serviceStartPending || permissionPending) {
    return MonitorStatus.STARTING
  }
  return MonitorStatus.UNAVAILABLE
}
