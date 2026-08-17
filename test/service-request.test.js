import assert from 'node:assert/strict'
import test from 'node:test'
import { isServiceRequestAccepted } from '../core/service-request.js'

test('only Zepp App Service success code zero is accepted', () => {
  assert.equal(isServiceRequestAccepted(0), true)
  assert.equal(isServiceRequestAccepted(false), true)
  assert.equal(isServiceRequestAccepted(1), false)
  assert.equal(isServiceRequestAccepted(2), false)
  assert.equal(isServiceRequestAccepted(255), false)
})
