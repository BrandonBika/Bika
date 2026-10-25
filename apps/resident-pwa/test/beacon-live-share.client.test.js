import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getActiveSharesForMe,
  setLivePath,
  simplifyLiveSharePath,
  startLiveShare,
  stopLiveShare,
  subscribeToLiveShares,
  updateLiveShare,
  watchLiveShareLocation
} from '../src/features/beacon/beacon-live-share.client.js';
import { setSession, clearSession } from '../../../packages/supabase-client/src/auth.js';
import { configureSupabaseClient } from '../../../packages/supabase-client/src/client.js';

configureSupabaseClient({
  url: 'https://beacon-live-share-test.supabase.co',
  anonKey: 'public-test-key'
});
setSession('resident-access-token', { id: 'resident-a' }, 'resident-refresh-token');

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor() {
    this.readyState = MockWebSocket.CONNECTING;
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    });
  }

  send(value) {
    const [joinRef, ref, topic, event, payload] = JSON.parse(value);
    if (event === 'phx_join') {
      const reply = {
        status: 'ok',
        response: {
          postgres_changes: payload.config.postgres_changes.map((change, index) => ({
            ...change,
            id: String(index + 1)
          }))
        }
      };
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify([joinRef, ref, topic, 'phx_reply', reply])
      }));
    } else if (event === 'heartbeat') {
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify([null, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
      }));
    }
  }

  close(options = {}) {
    this.readyState = MockWebSocket.CLOSED;
    queueMicrotask(() => this.onclose?.({ code: options.code || 1000 }));
  }
}

function installLocationWatch({ fakeTimers = false } = {}) {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldNow = Date.now;
  const oldSetTimeout = globalThis.setTimeout;
  const oldClearTimeout = globalThis.clearTimeout;
  let locationCallback;
  let clearCount = 0;
  let now = 100000;
  let timerId = 0;
  const timers = new Map();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        watchPosition(onPosition) {
          locationCallback = onPosition;
          return 1;
        },
        clearWatch() {
          clearCount += 1;
        }
      }
    }
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {}
    }
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {}
    }
  });
  if (fakeTimers) {
    Date.now = () => now;
    globalThis.setTimeout = (callback, delay) => {
      const id = ++timerId;
      timers.set(id, { callback, dueAt: now + delay });
      return id;
    };
    globalThis.clearTimeout = (id) => timers.delete(id);
  }
  return {
    emit(accuracy = 20) {
      locationCallback({
        coords: { latitude: -29.86, longitude: 31.02, accuracy },
        timestamp: now
      });
    },
    advance(milliseconds) {
      now += milliseconds;
    },
    expireNextTimer() {
      const [id, timer] = [...timers.entries()].sort((a, b) => a[1].dueAt - b[1].dueAt)[0] || [];
      if (!timer) throw new Error('No pending expiry timer was registered.');
      timers.delete(id);
      now = timer.dueAt;
      timer.callback();
    },
    clearCount: () => clearCount,
    restore() {
      Date.now = oldNow;
      globalThis.setTimeout = oldSetTimeout;
      globalThis.clearTimeout = oldClearTimeout;
      if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
      else delete globalThis.navigator;
      if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
      else delete globalThis.document;
      if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
      else delete globalThis.window;
    }
  };
}

async function flushPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

test('live share client calls secured RPCs and selects active shares for both participants', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/rpc/start_live_share')) return new Response('"share-1"');
    if (parsed.pathname.endsWith('/live_location_shares')) {
      return new Response(JSON.stringify(parsed.searchParams.get('recipient_id')
        ? [{
            id: 'share-2',
            sharer_id: 'resident-b',
            recipient_id: 'resident-a',
            started_at: '2026-10-26T00:00:00.000Z',
            expires_at: '2026-10-26T00:15:00.000Z',
            stopped_at: null,
            last_lat: -29.86,
            last_lng: 31.02,
            last_accuracy_m: 20,
            last_at: '2026-10-26T00:01:00.000Z',
            planned_path: [[-29.86, 31.02], [-29.87, 31.03]]
          }]
        : []));
    }
    return new Response('null');
  };
  try {
    assert.equal(await startLiveShare('resident-b', 15), 'share-1');
    await updateLiveShare('share-1', { lat: -29.86, lng: 31.02, accuracy: 20 });
    await stopLiveShare('share-1');
    const shares = await getActiveSharesForMe();
    assert.equal(shares.length, 1);
    assert.deepEqual(shares[0], {
      id: 'share-2',
      sharerId: 'resident-b',
      recipientId: 'resident-a',
      startedAt: '2026-10-26T00:00:00.000Z',
      expiresAt: '2026-10-26T00:15:00.000Z',
      stoppedAt: null,
      lastLat: -29.86,
      lastLng: 31.02,
      lastAccuracyM: 20,
      lastAt: '2026-10-26T00:01:00.000Z',
      plannedPath: [[-29.86, 31.02], [-29.87, 31.03]]
    });
    assert.equal(new URL(requests[0].url).pathname, '/rest/v1/rpc/start_live_share');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      p_recipient: 'resident-b',
      p_minutes: 15
    });
    assert.deepEqual(JSON.parse(requests[1].options.body), {
      p_id: 'share-1',
      p_lat: -29.86,
      p_lng: 31.02,
      p_accuracy: 20
    });
    assert.deepEqual(JSON.parse(requests[2].options.body), { p_id: 'share-1' });
    assert.equal(requests.filter(({ url }) => url.includes('/live_location_shares?')).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('planned route is simplified to at most 50 points and sent through its RPC', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return new Response('null');
  };
  try {
    const coordinates = Array.from({ length: 180 }, (_, index) => [
      -29.86 + index * 0.0001,
      31.02 + (index % 2 ? 0.0004 : 0)
    ]);
    const simplified = simplifyLiveSharePath(coordinates);
    assert.ok(simplified.length <= 50);
    assert.deepEqual(simplified[0], coordinates[0]);
    assert.deepEqual(simplified.at(-1), coordinates.at(-1));

    await setLivePath('share-path', coordinates);
    assert.equal(new URL(requests[0].url).pathname, '/rest/v1/rpc/set_live_share_path');
    const body = JSON.parse(requests[0].options.body);
    assert.equal(body.p_id, 'share-path');
    assert.ok(body.p_path.length <= 50);
    assert.deepEqual(body.p_path[0], coordinates[0]);
    assert.deepEqual(body.p_path.at(-1), coordinates.at(-1));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('planned route can be removed by sending null through the RPC', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options = {}) => {
    request = { url: String(url), options };
    return new Response('null');
  };
  try {
    await setLivePath('share-clear', null);
    assert.equal(new URL(request.url).pathname, '/rest/v1/rpc/set_live_share_path');
    assert.deepEqual(JSON.parse(request.options.body), {
      p_id: 'share-clear',
      p_path: null
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('live-share watcher throttles updates to one per ten seconds', async () => {
  const originalFetch = globalThis.fetch;
  const watch = installLocationWatch({ fakeTimers: true });
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return new Response('null');
  };
  try {
    const stopWatching = watchLiveShareLocation({
      id: 'share-throttle',
      expiresAt: new Date(Date.now() + 60000).toISOString()
    });
    watch.emit();
    await flushPromises();
    watch.advance(5000);
    watch.emit();
    await flushPromises();
    watch.advance(5000);
    watch.emit();
    await flushPromises();
    assert.equal(requests.filter(({ url }) => url.endsWith('/rpc/update_live_share')).length, 2);
    stopWatching();
    await flushPromises();
    assert.equal(requests.filter(({ url }) => url.endsWith('/rpc/stop_live_share')).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    watch.restore();
  }
});

test('live-share watcher ignores poor-accuracy fixes', async () => {
  const originalFetch = globalThis.fetch;
  const watch = installLocationWatch({ fakeTimers: true });
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return new Response('null');
  };
  try {
    const stopWatching = watchLiveShareLocation({
      id: 'share-poor-accuracy',
      expiresAt: new Date(Date.now() + 60000).toISOString()
    });
    watch.emit(151);
    await flushPromises();
    assert.equal(requests.some((url) => url.endsWith('/rpc/update_live_share')), false);
    stopWatching();
    await flushPromises();
  } finally {
    globalThis.fetch = originalFetch;
    watch.restore();
  }
});

test('live-share watcher stops location updates and server share at expiry', async () => {
  const originalFetch = globalThis.fetch;
  const watch = installLocationWatch({ fakeTimers: true });
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return new Response('null');
  };
  try {
    watchLiveShareLocation({
      id: 'share-expiry',
      expiresAt: new Date(Date.now() + 30000).toISOString()
    });
    watch.expireNextTimer();
    await flushPromises();
    assert.equal(watch.clearCount(), 1);
    assert.equal(requests.filter((url) => url.endsWith('/rpc/stop_live_share')).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    watch.restore();
  }
});

test('live-share viewer refreshes by Realtime and a ten-second polling fallback', async () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const pollCallbacks = [];
  let selectCount = 0;
  let active = true;
  const updates = [];
  globalThis.WebSocket = MockWebSocket;
  globalThis.setInterval = (callback, delay) => {
    if (delay === 10000) pollCallbacks.push(callback);
    return pollCallbacks.length;
  };
  globalThis.clearInterval = () => {};
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/live_location_shares')) {
      selectCount += 1;
      const rows = parsed.searchParams.has('recipient_id') && active
        ? [{
            id: 'share-viewer',
            sharer_id: 'resident-b',
            recipient_id: 'resident-a',
            started_at: '2026-10-26T00:00:00.000Z',
            expires_at: '2026-10-26T00:15:00.000Z',
            stopped_at: null,
            last_lat: -29.86,
            last_lng: 31.02,
            last_accuracy_m: 20,
            last_at: '2026-10-26T00:01:00.000Z',
            planned_path: [[-29.86, 31.02], [-29.87, 31.03]]
          }]
        : [];
      return new Response(JSON.stringify(rows));
    }
    return new Response('null');
  };
  const subscription = subscribeToLiveShares((shares) => updates.push(shares), (error) => {
    throw error;
  });
  try {
    await subscription.ready;
    await flushPromises();
    const initialCount = selectCount;
    assert.ok(initialCount >= 2);
    assert.equal(pollCallbacks.length, 1);
    assert.ok(updates.flat().some((share) => share.plannedPath?.length === 2));
    active = false;
    pollCallbacks[0]();
    await flushPromises();
    assert.equal(selectCount, initialCount + 2);
    assert.ok(updates.length >= 2);
    assert.deepEqual(updates.at(-1), []);
  } finally {
    subscription.unsubscribe();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    clearSession();
  }
});
