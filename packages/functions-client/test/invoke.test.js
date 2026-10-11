/**
 * @file packages/functions-client/test/invoke.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { invokeFunction, Endpoints, configureFunctionsClient } from '../src/index.js';

describe('Functions Client (Mock Adapter)', () => {
  it('rejects mock sign-in instead of accepting demo credentials', async () => {
    configureFunctionsClient({ useMock: true });
    await assert.rejects(
      invokeFunction(Endpoints.AUTH_SIGN_IN, { identifier: 'not-a-real-user@example.test', password: 'ValidPassword123' }),
      (error) => error.code === 'LIVE_AUTH_REQUIRED' && error.status === 501
    );
  });

  it('submits a report and retrieves it', async () => {
    const rep = await invokeFunction(Endpoints.REPORT_SUBMIT, {
      title: 'Broken Traffic Light',
      description: 'Light stuck on red',
      category: 'traffic',
      latitude: -29.85,
      longitude: 31.02
    });
    assert.ok(rep.referenceNumber.startsWith('CN-2026-'));
  });

  it('returns explicitly marked demo place and route data', async () => {
    const search = await invokeFunction(Endpoints.BEACON_ROUTE, {
      operation: 'search',
      query: 'Park',
      origin: { lat: -29.86, lng: 31.02 }
    });
    assert.equal(search.mock, true);
    assert.ok(search.places.length > 0);

    const route = await invokeFunction(Endpoints.BEACON_ROUTE, {
      operation: 'route',
      origin: { lat: -29.86, lng: 31.02 },
      destination: search.places[0]
    });
    assert.equal(route.mock, true);
    assert.ok(route.coordinates.length >= 2);
  });
});
