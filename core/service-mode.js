export const SERVICE_MODE_PRODUCTION = 'production'
export const SERVICE_MODE_DEBUG = 'debug'

/** Parses the external App Service input without depending on Zepp OS APIs. */
export function parseServiceMode(params) {
  return typeof params === 'string' && params.includes('mode=debug')
    ? SERVICE_MODE_DEBUG
    : SERVICE_MODE_PRODUCTION
}
