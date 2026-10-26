import assert from 'node:assert/strict';
import test from 'node:test';
import { configureSupabaseClient } from '../../../packages/supabase-client/src/client.js';
import { clearSession } from '../../../packages/supabase-client/src/auth.js';
import { endSession, startResidentSession } from '../src/session.js';

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};

const {
  categoryDisplayLabel,
  clearHomeLocation,
  refreshAreaInsights,
  setHomeLocation
} = await import('../src/features/area/area.client.js');
const { areaStore } = await import('../src/features/area/area.store.js');

configureSupabaseClient({
  url: 'https://area-insights-test.supabase.co',
  anonKey: 'public-test-key'
});

function response(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), { status });
}

function signIn() {
  startResidentSession('area-test-access-token', {
    id: `area-insights-test-${Date.now()}`
  }, 'area-test-refresh-token');
}

test('area insight client maps ok, no-area, insufficient and RPC error states', async () => {
  const originalFetch = globalThis.fetch;
  signIn();
  let payload = {
    state: 'ok',
    window_days: 7,
    radius_m: 5000,
    trending: { category: 'waste', count: 5 },
    pulse: { resolved_pct: 60, total: 10 }
  };
  globalThis.fetch = async () => response(payload);

  try {
    const ok = await refreshAreaInsights({ force: true });
    assert.equal(ok.status, 'ok');
    assert.deepEqual(ok.trending, { category: 'Waste', count: 5 });
    assert.deepEqual(ok.pulse, { resolved_pct: 60, total: 10 });
    assert.equal(ok.homeAreaSet, true);

    payload = {
      state: 'no_area',
      window_days: 7,
      radius_m: 5000,
      trending: null,
      pulse: null
    };
    const noArea = await refreshAreaInsights({ force: true });
    assert.equal(noArea.status, 'no_area');
    assert.equal(noArea.homeAreaSet, false);

    payload = {
      state: 'insufficient',
      window_days: 7,
      radius_m: 5000,
      trending: null,
      pulse: null
    };
    const insufficient = await refreshAreaInsights({ force: true });
    assert.equal(insufficient.status, 'insufficient');
    assert.equal(insufficient.homeAreaSet, true);

    globalThis.fetch = async () => response({ message: 'RPC unavailable' }, 500);
    await assert.rejects(refreshAreaInsights({ force: true }));
    assert.equal(areaStore.get().status, 'error');
    assert.equal(areaStore.get().isLoading, false);
  } finally {
    globalThis.fetch = originalFetch;
    clearSession();
    endSession();
  }
});

test('home location writes use validated RPC arguments and invalidate cached insights', async () => {
  const originalFetch = globalThis.fetch;
  signIn();
  const calls = [];
  let nextInsightsState = 'no_area';
  globalThis.fetch = async (url, options = {}) => {
    const name = new URL(url).pathname.split('/').pop();
    calls.push({ name, body: options.body ? JSON.parse(options.body) : null });
    if (name === 'set_home_location') {
      nextInsightsState = 'insufficient';
      return response(null, 204);
    }
    if (name === 'clear_home_location') {
      nextInsightsState = 'no_area';
      return response(null, 204);
    }
    return response({
      state: nextInsightsState,
      window_days: 7,
      radius_m: 5000,
      trending: null,
      pulse: null
    });
  };

  try {
    await refreshAreaInsights({ force: true });
    assert.equal(calls[0].name, 'get_area_insights');
    await assert.rejects(setHomeLocation(91, 20), TypeError);
    await assert.rejects(setHomeLocation(-29, 181), TypeError);
    assert.equal(calls.length, 1);

    await setHomeLocation(-29.86, 31.02);
    assert.deepEqual(calls[1], {
      name: 'set_home_location',
      body: { p_lat: -29.86, p_lng: 31.02 }
    });
    assert.equal(calls[2].name, 'get_area_insights');
    assert.equal(areaStore.get().homeAreaSet, true);

    await clearHomeLocation();
    assert.equal(calls[3].name, 'clear_home_location');
    assert.equal(calls[4].name, 'get_area_insights');
    assert.equal(areaStore.get().homeAreaSet, false);
  } finally {
    globalThis.fetch = originalFetch;
    clearSession();
    endSession();
  }
});

test('category labels use configured labels and title-case unknown values', () => {
  assert.equal(categoryDisplayLabel('waste'), 'Waste');
  assert.equal(categoryDisplayLabel('utility_winter'), 'Utility Winter');
});
