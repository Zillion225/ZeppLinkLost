import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPermissionGranted,
  isServiceRequestAccepted,
  isServiceStartSuccessful,
} from '../core/service-request.js'

test('only Zepp App Service success code zero is accepted', () => {
  assert.equal(isServiceRequestAccepted(0), true)
  assert.equal(isServiceRequestAccepted(false), true)
  assert.equal(isServiceRequestAccepted(1), false)
  assert.equal(isServiceRequestAccepted(2), false)
  assert.equal(isServiceRequestAccepted(255), false)
})

test('Zepp App Service start callback uses a Boolean result', () => {
  assert.equal(isServiceStartSuccessful(true), true)
  assert.equal(isServiceStartSuccessful(false), false)
  assert.equal(isServiceStartSuccessful(0), false)
  assert.equal(isServiceStartSuccessful(1), false)
})

test('Zepp permission APIs use result code two for granted access', () => {
  assert.equal(isPermissionGranted(2), true)
  assert.equal(isPermissionGranted('2'), true)
  assert.equal(isPermissionGranted(0), false)
  assert.equal(isPermissionGranted(1), false)
})
