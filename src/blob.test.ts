import assert from 'node:assert/strict'
import test from 'node:test'
import { closedSplinePath, createRadialBlobPoints, createRectBlobPoints } from './blob.ts'

test('rectangular blob points stay outside the protected content rectangle', () => {
  const points = createRectBlobPoints(600, 720, 40, 0.42, 0)

  assert.ok(points.slice(0, 4).every(({ y }) => y <= 40))
  assert.ok(points.slice(4, 8).every(({ x }) => x >= 560))
  assert.ok(points.slice(8, 12).every(({ y }) => y >= 680))
  assert.ok(points.slice(12, 16).every(({ x }) => x <= 40))
})

test('blob geometry changes with both time and seed', () => {
  const initial = closedSplinePath(createRectBlobPoints(320, 180, 14, 0.21, 0))
  const later = closedSplinePath(createRectBlobPoints(320, 180, 14, 0.21, 1))
  const anotherSeed = closedSplinePath(createRectBlobPoints(320, 180, 14, 0.73, 0))

  assert.notEqual(initial, later)
  assert.notEqual(initial, anotherSeed)
})

test('radial blobs never enter their protected center radius', () => {
  const points = createRadialBlobPoints(200, 200, 72, 14, 10, 0.37, 2)

  assert.ok(points.every(({ x, y }) => Math.hypot(x - 100, y - 100) >= 72))
})
