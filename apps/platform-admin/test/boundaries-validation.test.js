import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBoundaryContent, validateBoundaryFile } from '../src/features/boundaries.validation.js';

const validFeatureCollection = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: 'Ward 1' },
    geometry: {
      type: 'Polygon',
      coordinates: [[[31, -29], [31.1, -29], [31.1, -29.1], [31, -29]]]
    }
  }]
};

test('boundary validator accepts and retains polygon GeoJSON features', async () => {
  const result = await validateBoundaryContent(JSON.stringify(validFeatureCollection));
  assert.equal(result.geojson.type, 'FeatureCollection');
  assert.equal(result.featureCount, 1);
  assert.equal(result.geojson.features[0].properties.name, 'Ward 1');
});

test('boundary validator accepts degree coordinates when a CRS member is present', async () => {
  const withCrs = {
    ...validFeatureCollection,
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } }
  };
  const result = await validateBoundaryContent(JSON.stringify(withCrs));
  assert.equal(result.featureCount, 1);
});

test('boundary validator rejects files without the .geojson extension', async () => {
  assert.throws(
    () => validateBoundaryFile({ name: 'boundary.json', size: 1, text: async () => '{}' }),
    { message: 'Only .geojson files are accepted' }
  );
});

test('boundary validator rejects a Point-only file', async () => {
  await assert.rejects(validateBoundaryContent(JSON.stringify({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [31, -29] }
  })), /at least one Polygon or MultiPolygon/);
});

test('boundary validator rejects out-of-range coordinates', async () => {
  const invalid = JSON.parse(JSON.stringify(validFeatureCollection));
  invalid.features[0].geometry.coordinates[0][0] = [200, -29];
  await assert.rejects(
    validateBoundaryContent(JSON.stringify(invalid)),
    /looks projected; re-export as WGS84 lon\/lat/
  );
});
