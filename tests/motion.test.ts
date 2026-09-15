import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { orientation, PositionEstimator } from '../src/scripts/motion-math.ts';

test('device alpha rotates device X toward world Y', () => {
  const result = new Vector3(1, 0, 0).applyQuaternion(orientation(90, 0, 0));
  assert.ok(result.distanceTo(new Vector3(0, 1, 0)) < 1e-10);
});
test('neutral calibration yields identity at any starting orientation', () => {
  const q = orientation(130, 65, -22);
  assert.ok(q.clone().invert().multiply(q).angleTo(orientation(0, 0, 0)) < 1e-7);
});
test('one second of constant acceleration yields half a metre', () => {
  const estimator = new PositionEstimator();
  for (let i = 0; i <= 100; i++) estimator.step(new Vector3(1, 0, 0), i * 10);
  assert.ok(Math.abs(estimator.position.x - .5) < 1e-10);
  assert.ok(Math.abs(estimator.velocity.x - 1) < 1e-10);
});
test('long sensor gaps do not extrapolate stale velocity', () => {
  const estimator = new PositionEstimator();
  estimator.step(new Vector3(1, 0, 0), 0);
  estimator.step(new Vector3(1, 0, 0), 10);
  const before = estimator.position.clone();
  estimator.step(new Vector3(1, 0, 0), 2010);
  assert.ok(estimator.position.equals(before));
  assert.equal(estimator.velocity.length(), 0);
  estimator.reset();
  assert.equal(estimator.position.length(), 0);
});
