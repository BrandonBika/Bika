import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForRouteStylesheet } from '../src/components/app-shell/route-stylesheet.js';

function createStylesheet() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type) {
      listeners.get(type)?.();
    },
    get listenerCount() {
      return listeners.size;
    }
  };
}

test('resolves when the route stylesheet loads', async () => {
  const stylesheet = createStylesheet();
  const result = waitForRouteStylesheet(stylesheet, 100);
  stylesheet.dispatch('load');

  assert.equal(await result, 'load');
  assert.equal(stylesheet.listenerCount, 0);
});

test('resolves when the route stylesheet errors', async () => {
  const stylesheet = createStylesheet();
  const result = waitForRouteStylesheet(stylesheet, 100);
  stylesheet.dispatch('error');

  assert.equal(await result, 'error');
  assert.equal(stylesheet.listenerCount, 0);
});

test('times out while waiting for a route stylesheet', async () => {
  const stylesheet = createStylesheet();

  assert.equal(await waitForRouteStylesheet(stylesheet, 1), 'timeout');
  assert.equal(stylesheet.listenerCount, 0);
});
