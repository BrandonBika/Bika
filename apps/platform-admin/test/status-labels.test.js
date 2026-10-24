import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategoryLabel } from '../src/features/status-labels.js';

test('category labels use canonical labels for known values and aliases', () => {
  assert.equal(getCategoryLabel('electricity'), 'Electricity issues');
  assert.equal(getCategoryLabel('water_sanitation'), 'Water & sanitation');
  assert.equal(getCategoryLabel('roads_traffic'), 'Roads & traffic');
  assert.equal(getCategoryLabel('safety_security'), 'Safety & security');
  assert.equal(getCategoryLabel('crime_safety'), 'Safety & security');
  assert.equal(getCategoryLabel('Safety & Security'), 'Safety & security');
  assert.equal(getCategoryLabel('fire'), 'Fire');
  assert.equal(getCategoryLabel('medical'), 'Medical');
  assert.equal(getCategoryLabel('water'), 'Water');
  assert.equal(getCategoryLabel('other'), 'Other');
});

test('category labels handle missing and unknown values', () => {
  assert.equal(getCategoryLabel(null), 'Uncategorised');
  assert.equal(getCategoryLabel(undefined), 'Uncategorised');
  assert.equal(getCategoryLabel('  '), 'Uncategorised');
  assert.equal(getCategoryLabel('street_lighting'), 'Street lighting');
  assert.equal(getCategoryLabel('CUSTOM_VALUE'), 'CUSTOM VALUE');
});
