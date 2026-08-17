import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseServiceMode,
  SERVICE_MODE_DEBUG,
  SERVICE_MODE_PRODUCTION,
} from '../core/service-mode.js'

test('service defaults to real Bluetooth production mode', () => {
  assert.equal(parseServiceMode(), SERVICE_MODE_PRODUCTION)
  assert.equal(parseServiceMode(''), SERVICE_MODE_PRODUCTION)
  assert.equal(parseServiceMode('source=page'), SERVICE_MODE_PRODUCTION)
})

test('service enters Debug mode only from an explicit external parameter', () => {
  assert.equal(parseServiceMode('mode=debug'), SERVICE_MODE_DEBUG)
  assert.equal(parseServiceMode('source=page&mode=debug'), SERVICE_MODE_DEBUG)
})
