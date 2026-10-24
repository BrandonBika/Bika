import assert from 'node:assert/strict';
import test from 'node:test';
import { isMapVisible, mapPinState } from '../src/features/map-visibility.js';

const coordinates = { latitude: -29.9, longitude: 31 };

test('attended statuses are hidden from the map', () => {
  for (const status of ['Resolved', 'Rejected', 'Duplicate']) {
    const report = { ...coordinates, status };
    assert.equal(isMapVisible(report), false);
    assert.equal(mapPinState(report), 'Hidden');
  }
});

test('other statuses with valid coordinates remain shown', () => {
  for (const status of ['Pending', 'New', 'Needs Review', 'In Progress', 'Acknowledged', 'Dispatched']) {
    const report = { ...coordinates, status };
    assert.equal(isMapVisible(report), true);
    assert.equal(mapPinState(report), 'Shown');
  }
});

test('map visibility accepts coordinate fallbacks and hides missing or invalid coordinates', () => {
  assert.equal(isMapVisible({
    status: 'Pending',
    location_lat: '-29.9',
    location_lng: '31'
  }), true);
  assert.equal(isMapVisible({ status: 'Pending', latitude: null, longitude: 31 }), false);
  assert.equal(isMapVisible({ status: 'Pending', latitude: 'south', longitude: 31 }), false);
  assert.equal(isMapVisible({ status: 'Pending', latitude: -29.9, longitude: 'east' }), false);
  assert.equal(mapPinState({ status: 'Pending', latitude: '', longitude: 31 }), 'Hidden');
});
