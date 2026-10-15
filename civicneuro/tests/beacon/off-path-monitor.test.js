import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOffPathMonitor,
  OffPathMonitor,
  resetOffPathMonitor
} from '../../apps/resident-pwa/src/features/beacon/off-path-monitor.js';

const precise = { distanceMeters: 130, accuracyMeters: 20 };

test('requires a precise location outside the 100 m corridor for 20 seconds', () => {
  const monitor = new OffPathMonitor();
  assert.equal(monitor.observe({ ...precise, now: 0 }), false);
  assert.equal(monitor.observe({ ...precise, now: 19999 }), false);
  assert.equal(monitor.observe({ ...precise, now: 20000 }), true);
});

test('does not count repeated evaluations of the same location timestamp as new evidence', () => {
  const monitor = new OffPathMonitor();
  assert.equal(monitor.observe({ ...precise, now: 1000 }), false);
  assert.equal(monitor.observe({ ...precise, now: 1000 }), false);
  assert.equal(monitor.observe({ ...precise, now: 1000 }), false);
  assert.equal(monitor.observe({ ...precise, now: 21000 }), true);
});

test('does not trigger for locations with 50 m accuracy or worse', () => {
  const monitor = new OffPathMonitor();
  assert.equal(monitor.observe({ distanceMeters: 300, accuracyMeters: 50, now: 0 }), false);
  assert.equal(monitor.observe({ distanceMeters: 300, accuracyMeters: 49, now: 20000 }), false);
});

test('resets the sustained-deviation timer when the user returns inside the corridor', () => {
  const monitor = new OffPathMonitor();
  monitor.observe({ ...precise, now: 0 });
  monitor.observe({ distanceMeters: 80, accuracyMeters: 20, now: 15000 });
  assert.equal(monitor.observe({ ...precise, now: 20000 }), false);
  assert.equal(monitor.observe({ ...precise, now: 39999 }), false);
  assert.equal(monitor.observe({ ...precise, now: 40000 }), true);
});

test('resets the sustained-deviation timer after a location update gap over 30 seconds', () => {
  const monitor = new OffPathMonitor();
  monitor.observe({ ...precise, now: 0 });
  assert.equal(monitor.observe({ ...precise, now: 31000 }), false);
  assert.equal(monitor.observe({ ...precise, now: 50999 }), false);
  assert.equal(monitor.observe({ ...precise, now: 51000 }), true);
});

test('requires 30 seconds inside the corridor before another alert can fire', () => {
  const monitor = new OffPathMonitor();
  monitor.observe({ ...precise, now: 0 });
  assert.equal(monitor.observe({ ...precise, now: 20000 }), true);
  assert.equal(monitor.observe({ distanceMeters: 80, accuracyMeters: 20, now: 21000 }), false);
  assert.equal(monitor.observe({ ...precise, now: 30000 }), false);
  assert.equal(monitor.observe({ distanceMeters: 80, accuracyMeters: 20, now: 31000 }), false);
  assert.equal(monitor.observe({ distanceMeters: 80, accuracyMeters: 20, now: 61000 }), false);
  monitor.observe({ ...precise, now: 62000 });
  assert.equal(monitor.observe({ ...precise, now: 82000 }), true);
});

test('an inaccurate update pauses re-arming and breaks an unconfirmed excursion', () => {
  const monitor = new OffPathMonitor();
  monitor.observe({ ...precise, now: 0 });
  assert.equal(monitor.observe({ distanceMeters: 80, accuracyMeters: 20, now: 1000 }), false);
  assert.equal(monitor.observe({ distanceMeters: 80, accuracyMeters: 49, now: 20000 }), false);
  assert.equal(monitor.observe({ distanceMeters: 80, accuracyMeters: 20, now: 30000 }), false);
  assert.equal(monitor.observe({ ...precise, now: 31000 }), false);
  assert.equal(monitor.observe({ ...precise, now: 51000 }), true);
});

test('dismissing an alert keeps it disarmed until a full safe return', () => {
  const monitor = new OffPathMonitor();
  monitor.observe({ ...precise, now: 0 });
  monitor.observe({ ...precise, now: 20000 });
  monitor.dismiss();
  assert.equal(monitor.observe({ ...precise, now: 21000 }), false);
  monitor.observe({ distanceMeters: 80, accuracyMeters: 20, now: 22000 });
  monitor.observe({ distanceMeters: 80, accuracyMeters: 20, now: 52000 });
  monitor.observe({ ...precise, now: 53000 });
  assert.equal(monitor.observe({ ...precise, now: 73000 }), true);
});

test('retains dwell and re-arm state across session page remounts', () => {
  const session = {};
  const monitor = getOffPathMonitor(session);
  monitor.observe({ ...precise, now: 0 });
  assert.equal(getOffPathMonitor(session), monitor);
  assert.equal(getOffPathMonitor(session).observe({ ...precise, now: 20000 }), true);
  const resetMonitor = resetOffPathMonitor(session);
  assert.equal(resetMonitor, getOffPathMonitor(session));
  assert.notEqual(resetMonitor, monitor);
});
