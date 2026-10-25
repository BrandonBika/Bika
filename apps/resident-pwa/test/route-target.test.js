import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { isBeaconRouteGated } from '../src/route-target.js';

test('Beacon routes stay gated when the runtime flag is missing or false', () => {
  assert.equal(isBeaconRouteGated('beacon-home'), true);
  assert.equal(isBeaconRouteGated('beacon-chat', {}, false), true);
  assert.equal(isBeaconRouteGated('beacon-requests', {}, false), true);
  assert.equal(isBeaconRouteGated('beacon-add-to-circle', {}, false), true);
  assert.equal(isBeaconRouteGated('beacon-find-contacts', {}, false), true);
  assert.equal(isBeaconRouteGated('beacon-start-confirm', {}, false), true);
  assert.equal(isBeaconRouteGated('beacon-share-session', {}, false), true);
  assert.equal(isBeaconRouteGated('beacon-draw-path', {}, false), true);
  assert.equal(isBeaconRouteGated('contacts-permission', { source: 'beacon' }), true);
  assert.equal(isBeaconRouteGated('contacts-permission', { source: 'lifeline' }), false);
});

test('the production runtime enables live sharing but keeps path drawing gated', () => {
  assert.equal(config.beaconEnabled, true);
  assert.equal(isBeaconRouteGated('beacon-home', {}, true), false);
  assert.equal(isBeaconRouteGated('beacon-requests', {}, true), false);
  assert.equal(isBeaconRouteGated('beacon-add-to-circle', {}, true), false);
  assert.equal(isBeaconRouteGated('beacon-find-contacts', {}, true), false);
  assert.equal(isBeaconRouteGated('beacon-chat', {}, true), false);
  assert.equal(isBeaconRouteGated('contacts-permission', { source: 'beacon' }, true), false);
  assert.equal(isBeaconRouteGated('beacon-start-confirm', {}, true), false);
  assert.equal(isBeaconRouteGated('beacon-share-session', {}, true), false);
  assert.equal(isBeaconRouteGated('beacon-draw-path', {}, true), true);
});
