import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBeaconHomeFallbackMapView } from '../src/pages/beacon-home/beacon-home-map-view.js';

const homePagePath = new URL('../src/pages/beacon-home/beacon-home.js', import.meta.url);
const homePageSource = await readFile(homePagePath, 'utf8');

test('Beacon home omits the automatic accuracy sheet and status pill', () => {
  const renderStart = homePageSource.indexOf('  render() {');
  const renderEnd = homePageSource.indexOf('  renderMemberList(', renderStart);
  assert.notEqual(renderStart, -1);
  assert.notEqual(renderEnd, -1);
  const renderSource = homePageSource.slice(renderStart, renderEnd);
  assert.doesNotMatch(renderSource, /bc-location-accuracy-status|bc-location-prompt-backdrop/);
  const applyStart = homePageSource.indexOf('  applyCurrentLocation(location) {');
  const applyEnd = homePageSource.indexOf('  openModeModal() {', applyStart);
  assert.doesNotMatch(homePageSource.slice(applyStart, applyEnd), /showLocationPrompt\(/);
});

test('Beacon home uses the configured Durban default and street-level zoom as fallback', () => {
  const fallback = getBeaconHomeFallbackMapView();
  assert.deepEqual(fallback.center, [-29.8587, 31.0218]);
  assert.equal(fallback.zoom, 13);
  assert.notDeepEqual(fallback.center, [0, 0]);
});
