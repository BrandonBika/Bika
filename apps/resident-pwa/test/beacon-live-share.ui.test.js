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
    this._textContent = '';
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

const fakeMapModule = `
export function createBeaconMap(container) {
  return {
    container,
    setView() { return this; },
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
const calls = [];
const acceptedContact = {
  user_id: 'resident-b',
  display_name: 'Kai Contact'
};
globalThis.fetch = async (request, options = {}) => {
  const url = new URL(request);
  calls.push({ path: url.pathname, method: options.method || 'GET' });
  let result = null;
  if (url.pathname.endsWith('/rpc/list_circle')) {
    result = [acceptedContact];
  } else if (url.pathname.endsWith('/rpc/stop_live_share')) {
    activeShare = false;
  } else if (url.pathname.endsWith('/live_location_shares')) {
    result = activeShare ? [{
      id: 'share-a',
      sharer_id: 'resident-a',
      recipient_id: 'resident-b',
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
      stopped_at: null,
      last_lat: -29.86,
      last_lng: 31.02,
      last_accuracy_m: 20,
      last_at: new Date().toISOString()
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
const { PageBeaconChat } = await import(pathToFileURL(path.join(appRoot, 'src/pages/beacon-chat/beacon-chat.js')));
const { isBeaconRouteGated } = await import(pathToFileURL(path.join(appRoot, 'src/route-target.js')));

function flattenText(node) {
  return node.textContent;
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

test('Stop sharing calls the server stop RPC', async () => {
  activeShare = true;
  calls.length = 0;
  const page = new PageBeaconShareSession();
  page.isConnected = true;
  page.init({ shareId: 'share-a' });
  await page.connectServerLiveShare();
  const stopButton = page.querySelector('#bc-stop-live-share');
  assert.ok(stopButton);
  stopButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(calls.some((call) => call.path.endsWith('/rpc/stop_live_share')));
  assert.equal(window.location.hash, 'beacon-home');
  page.disconnectedCallback();
});

test('viewer marker is removed and Sharing ended is rendered when the share ends', async () => {
  const page = new PageBeaconChat();
  page._chatBody = new FakeElement('div');
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
    lastAt: new Date().toISOString()
  };
  page.renderMessages();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(page._chatBody.querySelector('.fake-live-marker'));

  page._incomingLiveShare = null;
  page._liveShareEnded = true;
  page.renderMessages();
  assert.equal(page._chatBody.querySelector('.bc-live-share-map'), null);
  assert.match(flattenText(page._chatBody), /Sharing ended/);
});

test.after(() => {
  clearSession();
});
