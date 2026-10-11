import test from 'node:test';
import assert from 'node:assert/strict';
import { handleBeaconRoute } from './handler.js';

function createEnv(values = {}) {
  return { get: (name) => values[name] || '' };
}

function createRequest(payload, token = 'user-token') {
  return new Request('https://app.test/functions/v1/beacon-route', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function createFetch(upstream) {
  return async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return Response.json({ id: 'user-1' });
    }
    return upstream(url, options);
  };
}

const env = createEnv({
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'public-anon-key',
  BEACON_GEOCODER_URL: 'https://geocoder.internal/',
  BEACON_ROUTING_URL: 'https://router.internal/',
  BEACON_ROUTING_PROFILE: 'foot'
});

test('rejects an unauthenticated routing request', async () => {
  const response = await handleBeaconRoute(createRequest({ operation: 'search', query: 'Park' }, ''), {
    env,
    fetchImpl: async () => Response.json({})
  });
  assert.equal(response.status, 401);
});

test('rejects a token not accepted by Supabase Auth', async () => {
  const response = await handleBeaconRoute(createRequest({ operation: 'search', query: 'Park' }), {
    env,
    fetchImpl: async () => new Response('{}', { status: 401 })
  });
  assert.equal(response.status, 401);
});

test('searches the configured geocoder without returning raw provider data', async () => {
  let requestedUrl;
  const response = await handleBeaconRoute(createRequest({ operation: 'search', query: 'Musgrave' }), {
    env,
    fetchImpl: createFetch(async (url) => {
      requestedUrl = new URL(url);
      return Response.json([
        { lat: '-29.86', lon: '31.02', display_name: 'Musgrave, Durban', type: 'suburb' },
        { lat: 'invalid', lon: '31.02', display_name: 'Invalid result' }
      ]);
    })
  });
  assert.equal(requestedUrl.hostname, 'geocoder.internal');
  assert.equal(requestedUrl.searchParams.get('q'), 'Musgrave');
  assert.deepEqual(await response.json(), {
    places: [{ id: '-29.86,31.02', name: 'Musgrave, Durban', lat: -29.86, lng: 31.02 }]
  });
});

test('returns walking-route coordinates in Leaflet latitude/longitude order', async () => {
  let requestedUrl;
  const response = await handleBeaconRoute(createRequest({
    operation: 'route',
    origin: { lat: -29.86, lng: 31.02 },
    destination: { lat: -29.85, lng: 31.03 }
  }), {
    env,
    fetchImpl: createFetch(async (url) => {
      requestedUrl = new URL(url);
      return Response.json({
        code: 'Ok',
        routes: [{
          distance: 1800,
          duration: 1400,
          geometry: { coordinates: [[31.02, -29.86], [31.03, -29.85]] }
        }]
      });
    })
  });
  assert.match(requestedUrl.pathname, /route\/v1\/foot\//);
  assert.deepEqual(await response.json(), {
    coordinates: [[-29.86, 31.02], [-29.85, 31.03]],
    distanceMeters: 1800,
    durationSeconds: 1400
  });
});

test('rejects routes outside the supported safety range', async () => {
  const response = await handleBeaconRoute(createRequest({
    operation: 'route',
    origin: { lat: -29.86, lng: 31.02 },
    destination: { lat: -29.85, lng: 31.03 }
  }), {
    env,
    fetchImpl: createFetch(async () => Response.json({
      code: 'Ok',
      routes: [{
        distance: 12000,
        duration: 10000,
        geometry: { coordinates: [[31.02, -29.86], [31.03, -29.85]] }
      }]
    }))
  });
  assert.equal(response.status, 422);
});

test('caps returned route geometry at 500 points', async () => {
  const coordinates = Array.from({ length: 750 }, (_, index) => [
    31.02 + index * 0.000001,
    -29.86 + index * 0.000001
  ]);
  const response = await handleBeaconRoute(createRequest({
    operation: 'route',
    origin: { lat: -29.86, lng: 31.02 },
    destination: { lat: -29.85, lng: 31.03 }
  }), {
    env,
    fetchImpl: createFetch(async () => Response.json({
      code: 'Ok',
      routes: [{ distance: 1800, duration: 1400, geometry: { coordinates } }]
    }))
  });
  const body = await response.json();
  assert.ok(body.coordinates.length <= 500);
  assert.ok(body.coordinates.length >= 2);
  assert.deepEqual(body.coordinates[0], [-29.86, 31.02]);
  assert.deepEqual(body.coordinates.at(-1), [-29.86 + 749 * 0.000001, 31.02 + 749 * 0.000001]);
});

test('reports missing self-hosted routing configuration clearly', async () => {
  const response = await handleBeaconRoute(createRequest({ operation: 'search', query: 'Park' }), {
    env: createEnv({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'public-anon-key'
    }),
    fetchImpl: createFetch(async () => Response.json([]))
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'ROUTING_NOT_CONFIGURED');
});
