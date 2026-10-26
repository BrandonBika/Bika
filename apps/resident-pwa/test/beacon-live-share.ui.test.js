import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const packageRoot = path.resolve(import.meta.dirname, '../../..', 'packages');
const appRoot = path.resolve(import.meta.dirname, '..');
const registeredElements = new Map();

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.style = {};
    this.classNames = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classNames.add(name))
    };
    this.parentNode = null;
    this.isConnected = true;
    this.disabled = false;
    this.hidden = false;
    this._textContent = '';
    this._listeners = new Map();
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get lastChild() {
    return this.children[this.children.length - 1] || null;
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent || '').join('');
  }

  set textContent(value) {
    this.children = [];
    this._textContent = String(value ?? '');
  }

  appendChild(child) {
    child.parentNode?.removeChild?.(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  removeChild(child) {
    this.children = this.children.filter((item) => item !== child);
    child.parentNode = null;
    return child;
  }

  remove() {
    this.parentNode?.removeChild(this);
    this.isConnected = false;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(name, listener) {
    if (!this._listeners.has(name)) this._listeners.set(name, []);
    this._listeners.get(name).push(listener);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 700 };
  }

  setPointerCapture() {}

  emit(name, event) {
    for (const listener of this._listeners.get(name) || []) listener(event);
  }

  querySelector(selector) {
    const matches = (element) => selector.startsWith('#')
      ? element.getAttribute('id') === selector.slice(1)
      : selector.startsWith('.')
        ? element.classNames.has(selector.slice(1))
        : element.tagName.toLowerCase() === selector.toLowerCase();
    for (const child of this.children) {
      if (matches(child)) return child;
      const descendant = child.querySelector(selector);
      if (descendant) return descendant;
    }
    return null;
  }

  contains(element) {
    return this === element || this.children.some((child) => child.contains(element));
  }

  click() {
    this.onclick?.({ target: this, preventDefault() {} });
  }
}

globalThis.HTMLElement = FakeElement;
globalThis.document = {
  hidden: false,
  body: new FakeElement('body'),
  createElement: (tagName) => new FakeElement(tagName),
  createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  createTextNode: (text) => ({ textContent: String(text), parentNode: null }),
  addEventListener() {},
  removeEventListener() {}
};
globalThis.window = {
  location: {
    hash: '',
    pathname: '/',
    search: '',
    replace(value) { this.hash = value.slice(value.indexOf('#')); }
  },
  history: { back() {}, pushState() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  addEventListener() {},
  removeEventListener() {}
};
globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    onLine: true,
    geolocation: {
      watchPosition() { return 1; },
      clearWatch() {}
    }
  }
});
globalThis.customElements = {
  define(name, element) { registeredElements.set(name, element); },
  get(name) { return registeredElements.get(name); }
};
globalThis.requestAnimationFrame = (callback) => callback();
globalThis.__fakeBeaconMapViews = [];

const fakeMapModule = `
export function createBeaconMap(container) {
  return {
    container,
    setView(center, zoom) {
      globalThis.__fakeBeaconMapViews.push({ center, zoom });
      return this;
    },
    fitBounds() { return this; },
    invalidateSize() { return this; },
    zoomIn() { return this; },
    zoomOut() { return this; },
    getZoom() { return 13; },
    removeLayer() { return this; },
    containerPointToLatLng([x, y]) {
      return { lat: -29.86 + y * 0.001, lng: 31.02 + x * 0.001 };
    },
    dragging: { disable() {}, enable() {} },
    once() {},
    remove() { this.removed = true; }
  };
}
export function createBeaconDotIcon() { return {}; }
export function createBeaconDivIcon() { return {}; }
export function mockPercentToLatLng(point) { return [point.lat, point.lng]; }
export function mockPathToLatLngs(points) { return points; }
export function rebasePathToLocation(points) { return points; }
export const L = {
  marker() {
    return {
      addTo(map) {
        const marker = document.createElement('span');
        marker.classList.add('fake-live-marker');
        map.container.appendChild(marker);
        return this;
      },
      bindTooltip() { return this; }
    };
  },
  polyline() {
    return {
      addTo(map) {
        const line = document.createElement('span');
        line.classList.add('fake-live-path');
        map.container.appendChild(line);
        return this;
      }
    };
  }
};
`;
const fakeMapUrl = `data:text/javascript,${encodeURIComponent(fakeMapModule)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@civicneuro/')) {
      const packageName = specifier.slice('@civicneuro/'.length);
      const entry = path.join(packageRoot, packageName, 'src', 'index.js');
      if (fs.existsSync(entry)) return { url: pathToFileURL(entry).href, shortCircuit: true };
    }
    if (context.parentURL?.startsWith('file:')) {
      const resolved = new URL(specifier, context.parentURL);
      if (resolved.pathname.endsWith('/features/beacon/leaflet-map.js')) {
        return { url: fakeMapUrl, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  }
});

const { configureSupabaseClient } = await import('../../../packages/supabase-client/src/client.js');
const { setSession, clearSession } = await import('../../../packages/supabase-client/src/auth.js');
configureSupabaseClient({
  url: 'https://beacon-live-share-ui-test.supabase.co',
  anonKey: 'public-test-key'
});
setSession('resident-access-token', { id: 'resident-a' }, 'resident-refresh-token');

let activeShare = true;
let plannedPath = null;
let shareLastLat = -29.86;
let shareLastLng = 31.02;
const calls = [];
const acceptedContact = {
  user_id: 'resident-b',
  display_name: 'Kai Contact'
};
globalThis.fetch = async (request, options = {}) => {
  const url = new URL(request);
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  calls.push({ path: url.pathname, method: options.method || 'GET', body });
  let result = null;
  if (url.pathname.endsWith('/rpc/list_circle')) {
    result = [acceptedContact];
  } else if (url.pathname.endsWith('/rpc/stop_live_share')) {
    activeShare = false;
    plannedPath = null;
  } else if (url.pathname.endsWith('/rpc/set_live_share_path')) {
    plannedPath = body?.p_path ?? null;
  } else if (url.pathname.endsWith('/live_location_shares')) {
    result = activeShare ? [{
      id: 'share-a',
      sharer_id: 'resident-a',
      recipient_id: 'resident-b',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
      stopped_at: null,
      last_lat: shareLastLat,
      last_lng: shareLastLng,
      last_accuracy_m: 20,
      last_at: new Date().toISOString(),
      planned_path: plannedPath
    }] : [];
  }
  return {
    ok: true,
    status: 200,
    async text() { return JSON.stringify(result); }
  };
};

globalThis.WebSocket = class {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor() {
    this.readyState = 0;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }

  send(value) {
    const [joinRef, ref, topic, event, payload] = JSON.parse(value);
    if (event === 'phx_join') {
      const response = {
        status: 'ok',
        response: {
          postgres_changes: payload.config.postgres_changes.map((change, index) => ({
            ...change,
            id: String(index + 1)
          }))
        }
      };
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify([joinRef, ref, topic, 'phx_reply', response])
      }));
    }
  }

  close() {
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.({ code: 1000 }));
  }
};

const { PageBeaconHome } = await import(pathToFileURL(path.join(appRoot, 'src/pages/beacon-home/beacon-home.js')));
const { PageBeaconStartConfirm } = await import(pathToFileURL(path.join(appRoot, 'src/pages/beacon-start-confirm/beacon-start-confirm.js')));
const { PageBeaconSafetyNotice } = await import(pathToFileURL(path.join(appRoot, 'src/pages/beacon-safety-notice/beacon-safety-notice.js')));
const { PageBeaconShareSession } = await import(pathToFileURL(path.join(appRoot, 'src/pages/beacon-share-session/beacon-share-session.js')));
const { PageBeaconDrawPath } = await import(pathToFileURL(path.join(appRoot, 'src/pages/beacon-draw-path/beacon-draw-path.js')));
const { PageBeaconChat } = await import(pathToFileURL(path.join(appRoot, 'src/pages/beacon-chat/beacon-chat.js')));
const { isBeaconRouteGated } = await import(pathToFileURL(path.join(appRoot, 'src/route-target.js')));
const { config } = await import(pathToFileURL(path.join(appRoot, 'src/config.js')));

function flattenText(node) {
  return node.textContent;
}

function createRenderedActiveDrawPage({
  lastLat = -29.86,
  lastLng = 31.02,
  plannedPath = null
} = {}) {
  const geolocation = navigator.geolocation;
  navigator.geolocation = undefined;
  const page = new PageBeaconDrawPath();
  page.isConnected = true;
  page.init({ shareId: 'share-a' });
  page._shareId = 'share-a';
  page._activeShare = {
    id: 'share-a',
    sharerId: 'resident-a',
    recipientId: 'resident-b',
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    lastLat,
    lastLng,
    plannedPath
  };
  page.connectedCallback();
  navigator.geolocation = geolocation;
  return page;
}

test('Draw a path is disabled and does not navigate; direct access renders the notice', () => {
  const initialHash = window.location.hash;
  const home = new PageBeaconHome();
  home.renderShareModeModal();
  const drawPath = home.querySelector('#bc-opt-draw-path');
  assert.equal(drawPath.getAttribute('aria-disabled'), 'true');
  assert.equal(drawPath.onclick, undefined);
  drawPath.click();
  assert.equal(window.location.hash, initialHash);

  assert.equal(isBeaconRouteGated('beacon-draw-path', {}, true), true);
  const notice = new PageBeaconSafetyNotice();
  notice.init({ requestedRoute: 'beacon-draw-path' });
  notice.render();
  assert.match(flattenText(notice), /Draw a path is not available yet/);
});

test('draw route rejects a supplied share ID when no active share belongs to the caller', async () => {
  activeShare = false;
  const page = new PageBeaconDrawPath();
  page.isConnected = true;
  page.init({ shareId: 'inactive-share' });
  page.connectedCallback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(window.location.hash, /beacon-safety-notice/);
  activeShare = true;
});

test('active-share drawing without GPS centers on Durban and has no GPS start prompt', () => {
  activeShare = true;
  plannedPath = null;
  shareLastLat = null;
  shareLastLng = null;
  globalThis.__fakeBeaconMapViews.length = 0;
  const page = createRenderedActiveDrawPage({ lastLat: null, lastLng: null });

  const activeShareView = globalThis.__fakeBeaconMapViews.at(-1);
  assert.deepEqual(activeShareView, {
    center: [config.defaultCenter.lat, config.defaultCenter.lng],
    zoom: 13
  });
  assert.notDeepEqual(activeShareView.center, [0, 0]);
  assert.equal(page.querySelector('.draw-hint-retry-btn').hidden, true);
  assert.equal(page.querySelector('.draw-hint-manual-start-btn').hidden, true);
  assert.doesNotMatch(page.querySelector('.draw-hint-body').textContent, /Retry location|choose your route starting point/i);
  page.disconnectedCallback();
  shareLastLat = -29.86;
  shareLastLng = 31.02;
});

test('active-share drawing centers on valid last known coordinates', () => {
  activeShare = true;
  plannedPath = null;
  shareLastLat = -26.2041;
  shareLastLng = 28.0473;
  globalThis.__fakeBeaconMapViews.length = 0;
  const page = createRenderedActiveDrawPage({
    lastLat: -26.2041,
    lastLng: 28.0473
  });

  assert.deepEqual(globalThis.__fakeBeaconMapViews.at(-1), {
    center: [-26.2041, 28.0473],
    zoom: 13
  });
  page.disconnectedCallback();
  shareLastLat = -29.86;
  shareLastLng = 31.02;
});

test('live-share confirmation lists only the accepted contact returned by the circle RPC', async () => {
  const page = new PageBeaconStartConfirm();
  page.isConnected = true;
  page.init({});
  page.connectedCallback();
  await new Promise((resolve) => setImmediate(resolve));
  page.querySelector('.cf-member-row').click();
  assert.match(flattenText(page), /Kai Contact/);
  assert.doesNotMatch(flattenText(page), /Pending Contact/);
  assert.match(flattenText(page), /15 min/);
  assert.match(flattenText(page), /30 min/);
  assert.match(flattenText(page), /60 min/);
  assert.match(flattenText(page), /It only updates while Bika is open/);
});

test('planned-route action opens drawing for the active share', async () => {
  activeShare = true;
  plannedPath = [[-29.86, 31.02], [-29.87, 31.03]];
  const page = new PageBeaconShareSession();
  page.isConnected = true;
  page.init({ shareId: 'share-a', routeShared: 'true' });
  await page.connectServerLiveShare();
  assert.match(flattenText(page), /Planned route shared with Kai Contact/);
  assert.match(flattenText(page), /Off-path alerts are not available/);
  assert.match(flattenText(page), /Removing or blocking Kai Contact stops it immediately/);
  page.querySelector('#bc-planned-route-action').click();
  assert.match(window.location.hash, /beacon-draw-path/);
  assert.match(window.location.hash, /shareId=share-a/);
  assert.equal(activeShare, true);
  page.disconnectedCallback();
});

test('confirming a drawn route calls set_live_share_path for the active share', async () => {
  activeShare = true;
  plannedPath = null;
  calls.length = 0;
  const page = createRenderedActiveDrawPage();
  page.calculateLiveDistance = () => {
    page._distanceMeters = 200;
    page._distanceKm = 0.2;
    page._timeMin = 3;
  };

  const canvas = page.querySelector('#draw-canvas');
  const event = (clientX, clientY) => ({
    isPrimary: true,
    pointerId: 1,
    clientX,
    clientY,
    preventDefault() {}
  });
  canvas.emit('pointerdown', event(0, 0));
  canvas.emit('pointermove', event(100, 50));
  canvas.emit('pointerup', event(100, 50));
  assert.equal(page._hasPath, true);
  assert.ok(page._points.length >= 2);

  await page.handleNext();
  const request = calls.find((call) => call.path.endsWith('/rpc/set_live_share_path'));
  assert.deepEqual(request.body, {
    p_id: 'share-a',
    p_path: [[-29.86, 31.02], [-29.81, 31.12]]
  });
  assert.match(window.location.hash, /beacon-share-session/);
  page.disconnectedCallback();
});

test('sharer can remove a planned route through the set path RPC', async () => {
  activeShare = true;
  plannedPath = [[-29.86, 31.02], [-29.87, 31.03]];
  calls.length = 0;
  const page = new PageBeaconShareSession();
  page.isConnected = true;
  page.init({ shareId: 'share-a' });
  await page.connectServerLiveShare();
  page.querySelector('#bc-remove-planned-route').click();
  await new Promise((resolve) => setImmediate(resolve));
  const request = calls.find((call) => call.path.endsWith('/rpc/set_live_share_path'));
  assert.deepEqual(request.body, { p_id: 'share-a', p_path: null });
  assert.equal(page._liveShare.plannedPath, null);
  page.disconnectedCallback();
});

test('Stop sharing calls the server stop RPC', async () => {
  activeShare = true;
  calls.length = 0;
  const page = new PageBeaconShareSession();
  page.isConnected = true;
  page.init({ shareId: 'share-a' });
  await page.connectServerLiveShare();
  try {
    const stopButton = page.querySelector('#bc-stop-live-share');
    assert.ok(stopButton);
    stopButton.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(calls.some((call) => call.path.endsWith('/rpc/stop_live_share')));
    assert.equal(window.location.hash, 'beacon-home');
  } finally {
    page.disconnectedCallback();
  }
});

test('sharer sees precise-GPS guidance until a location update arrives', () => {
  const page = new PageBeaconShareSession();
  page.isConnected = true;
  page._recipientName = 'Kai Contact';
  page._liveShare = {
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    lastAt: null
  };

  page.renderServerLiveShare();
  assert.equal(
    page.querySelector('#bc-live-share-last-update').textContent,
    'Waiting for a precise GPS fix. This works best on a phone with location turned on.'
  );

  page._liveShare.lastAt = new Date().toISOString();
  page.updateLiveShareCountdown();
  assert.match(page.querySelector('#bc-live-share-last-update').textContent, /^Last update /);
});

test('viewer marker is removed and Sharing ended is rendered when the share ends', async () => {
  const page = new PageBeaconChat();
  page._chatBody = new FakeElement('div');
  page.appendChild(page._chatBody);
  page._member = { id: 'resident-a', name: 'Kai Contact', initial: 'K' };
  page._memberId = 'resident-a';
  page._messages = [];
  page._incomingLiveShare = {
    id: 'share-b',
    sharerId: 'resident-a',
    recipientId: 'resident-b',
    lastLat: -29.86,
    lastLng: 31.02,
    lastAccuracyM: 20,
    lastAt: new Date().toISOString(),
    plannedPath: [[-29.86, 31.02], [-29.87, 31.03]]
  };
  page.renderMessages();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(page._chatBody.querySelector('.fake-live-marker'));
  assert.ok(page._chatBody.querySelector('.fake-live-path'));

  page._incomingLiveShare = null;
  page._liveShareEnded = true;
  page.renderMessages();
  assert.equal(page._chatBody.querySelector('.bc-live-share-map'), null);
  assert.equal(page._chatBody.querySelector('.fake-live-path'), null);
  assert.match(flattenText(page._chatBody), /Sharing ended/);
});

test('viewer identifies the contact before their first precise location arrives', () => {
  const page = new PageBeaconChat();
  page._chatBody = new FakeElement('div');
  page.appendChild(page._chatBody);
  page._member = { id: 'resident-a', name: 'Kai Contact', initial: 'K' };
  page._memberId = 'resident-a';
  page._messages = [];
  page._incomingLiveShare = {
    id: 'share-b',
    sharerId: 'resident-a',
    recipientId: 'resident-b',
    lastLat: null,
    lastLng: null,
    lastAccuracyM: null,
    lastAt: null
  };

  page.renderMessages();
  assert.match(flattenText(page._chatBody), /Kai Contact hasn't shared a precise location yet\./);

  page._incomingLiveShare.lastLat = -29.86;
  page._incomingLiveShare.lastLng = 31.02;
  page._incomingLiveShare.lastAt = new Date().toISOString();
  page.renderMessages();
  assert.match(page._chatBody.querySelector('.bc-live-share-age').textContent, /^Last updated 0s ago$/);
});

test.after(() => {
  clearSession();
});
