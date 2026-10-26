import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  areaStore,
  getAreaCardPresentation
} from '../src/features/area/area.store.js';

const homeSource = await readFile(
  new URL('../src/pages/home/home.js', import.meta.url),
  'utf8'
);

test('home area cards render empty-state copy without mock poll, news or survey values', () => {
  const emptyState = areaStore.get();
  const trending = getAreaCardPresentation(emptyState, 'trending');
  const pulse = getAreaCardPresentation(emptyState, 'pulse');

  assert.equal(trending.copy, 'Loading local reports…');
  assert.equal(pulse.copy, 'Loading local reports…');
  assert.doesNotMatch(`${trending.copy} ${trending.meta} ${pulse.copy} ${pulse.meta}`, /\d/);
  assert.match(homeSource, /getAreaCardPresentation\(state, 'trending'\)/);
  assert.match(homeSource, /getAreaCardPresentation\(state, 'pulse'\)/);
  assert.doesNotMatch(homeSource, /Should this park get more lighting|72% say waste collection|340 responses|Streetlights — #1 reported this week|4 new|1 open/);
  assert.doesNotMatch(homeSource, /text: 'Quick poll'/);
  assert.match(homeSource, /text: 'View'/);
});
