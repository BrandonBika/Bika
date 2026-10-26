import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const state = {
  invalidateCount: 0,
  loadListener: null,
  rafCallbacks: [],
  tileErrorHandler: null,
  tileUrl: null,
  timeoutCallbacks: []
};
globalThis.__leafletMapTestState = state;
globalThis.document = { readyState: 'loading' };
globalThis.window = {
  addEventListener(type, listener) {
    if (type === 'load') state.loadListener = listener;
  }
};
globalThis.requestAnimationFrame = (callback) => state.rafCallbacks.push(callback);
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay) => {
  state.timeoutCallbacks.push({ callback, delay });
  return state.timeoutCallbacks.length;
};

const leafletStub = `
  const state = globalThis.__leafletMapTestState;
  export function map() {
    return {
      setView(center, zoom) {
        state.center = center;
        state.zoom = zoom;
        return this;
      },
      invalidateSize() {
        state.invalidateCount++;
      }
    };
  }
  export function tileLayer(url) {
    state.tileUrl = url;
    return {
      on(eventName, callback) {
        if (eventName === 'tileerror') state.tileErrorHandler = callback;
        return this;
      },
      addTo() {
        state.tileLayerAdded = true;
      }
    };
  }
  export function divIcon() {}
`;
const configStub = `
  export const config = {
    defaultCenter: { lat: -29.8587, lng: 31.0218 },
    tileHost: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  };
`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/features/beacon/leaflet-map.js')) {
      if (specifier === '../../../public/vendor/leaflet/leaflet-src.esm.js') {
        return { url: `data:text/javascript,${encodeURIComponent(leafletStub)}`, shortCircuit: true };
      }
      if (specifier === '../../config.js') {
        return { url: `data:text/javascript,${encodeURIComponent(configStub)}`, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  }
});

const { createBeaconMap } = await import(
  '../src/features/beacon/leaflet-map.js'
);

function resetState() {
  state.invalidateCount = 0;
  state.loadListener = null;
  state.rafCallbacks = [];
  state.tileErrorHandler = null;
  state.tileUrl = null;
  state.timeoutCallbacks = [];
  state.tileLayerAdded = false;
}

test('logs only the first tile error for a map', (t) => {
  resetState();
  const log = t.mock.method(console, 'error', () => {});
  createBeaconMap({ isConnected: true });

  state.tileErrorHandler({ error: 'first failure' });
  state.tileErrorHandler({ error: 'second failure' });

  assert.equal(log.mock.callCount(), 1);
  assert.equal(log.mock.calls[0].arguments[0], '[map] tile failed');
  assert.equal(log.mock.calls[0].arguments[1], 'first failure');
  assert.equal(state.tileUrl, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.equal(state.tileLayerAdded, true);
});

test('invalidates size after animation frame, window load, and 300 ms delay', () => {
  resetState();
  const container = { isConnected: true };
  const map = createBeaconMap(container);

  assert.equal(state.rafCallbacks.length, 1);
  assert.equal(state.loadListener instanceof Function, true);
  assert.equal(state.timeoutCallbacks[0].delay, 300);

  state.rafCallbacks[0]();
  state.loadListener();
  state.timeoutCallbacks[0].callback();
  assert.equal(state.invalidateCount, 3);

  container.isConnected = false;
  state.timeoutCallbacks[0].callback();
  assert.equal(state.invalidateCount, 3);
  assert.ok(map);
});

test('skips the window-load listener when document is already complete', () => {
  resetState();
  document.readyState = 'complete';

  createBeaconMap({ isConnected: true });

  assert.equal(state.loadListener, null);
  assert.equal(state.timeoutCallbacks[0].delay, 300);
  document.readyState = 'loading';
});

test.after(() => {
  globalThis.setTimeout = originalSetTimeout;
  delete globalThis.__leafletMapTestState;
});
