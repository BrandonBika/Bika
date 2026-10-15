/**
 * @file packages/geo/test/geo.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { haversineDistance, isSouthAfricaCoordinate, pointInPolygon } from '../src/index.js';

describe('Geo Package', () => {
  it('calculates accurate distance', () => {
    // Durban to Johannesburg is ~500km
    const dist = haversineDistance(-29.8587, 31.0218, -26.2041, 28.0473);
    assert.ok(dist > 450000 && dist < 550000);
  });

  it('validates South Africa bounding box', () => {
    assert.strictEqual(isSouthAfricaCoordinate(-29.8587, 31.0218), true); // Durban
    assert.strictEqual(isSouthAfricaCoordinate(51.5074, -0.1278), false); // London
  });
});
