import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIndex,
  computeReportValues,
  discoverFields,
  findAllFeatures,
  findFeature,
  pointInFeature
} from '../src/features/boundary-lookup.js';

const square = (min = 0, max = 10) => [[
  [min, min], [max, min], [max, max], [min, max], [min, min]
]];

const polygonFeature = (geometry, properties = {}) => ({
  type: 'Feature',
  properties,
  geometry
});

test('pointInFeature matches Polygon interiors, outside points, and exterior edges', () => {
  const polygon = { type: 'Polygon', coordinates: square() };
  assert.equal(pointInFeature(5, 5, polygon), true);
  assert.equal(pointInFeature(12, 5, polygon), false);
  assert.equal(pointInFeature(0, 5, polygon), true);
});

test('pointInFeature handles MultiPolygon components', () => {
  const multiPolygon = {
    type: 'MultiPolygon',
    coordinates: [square(), [[
      [20, 20], [25, 20], [25, 25], [20, 25], [20, 20]
    ]]]
  };
  assert.equal(pointInFeature(22, 22, multiPolygon), true);
  assert.equal(pointInFeature(15, 15, multiPolygon), false);
});

test('holes are excluded, but their edges count as inside', () => {
  const withHole = {
    type: 'Polygon',
    coordinates: [
      square()[0],
      [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]
    ]
  };
  assert.equal(pointInFeature(2, 2, withHole), true);
  assert.equal(pointInFeature(5, 5, withHole), false);
  assert.equal(pointInFeature(3, 5, withHole), true);
});

test('findFeature converts report latitude/longitude order to GeoJSON longitude/latitude', () => {
  const feature = polygonFeature({
    type: 'Polygon',
    coordinates: [[[30, -30], [32, -30], [32, -29], [30, -29], [30, -30]]]
  });
  const index = buildIndex({ type: 'FeatureCollection', features: [feature] });
  assert.equal(findFeature(index, -29.5, 31), feature);
  assert.equal(findFeature(index, 31, -29.5), null);
});

test('findAllFeatures returns all nested and overlapping polygon matches in feature order', () => {
  const feature = (name, min, max) => polygonFeature({
    type: 'Polygon',
    coordinates: [[
      [min, min], [max, min], [max, max], [min, max], [min, min]
    ]]
  }, { name });
  const nested = feature('ward', 0, 10);
  const suburb = feature('suburb', 2, 8);
  const overlap = feature('overlap', 4, 12);
  const index = buildIndex({
    type: 'FeatureCollection',
    features: [nested, suburb, overlap]
  });

  assert.deepEqual(findAllFeatures(index, 5, 5), [nested, suburb, overlap]);
  assert.equal(findFeature(index, 5, 5), nested);
  assert.deepEqual(findAllFeatures(index, 1, 1), [nested]);
  assert.deepEqual(findAllFeatures(index, 20, 20), []);
});

test('computeReportValues stores matched features and null for missing or invalid coordinates', () => {
  const feature = polygonFeature({ type: 'Polygon', coordinates: square() });
  const index = buildIndex({ type: 'FeatureCollection', features: [feature] });
  const reports = [
    { id: 'inside', latitude: 5, longitude: 5 },
    { id: 'outside', latitude: 15, longitude: 15 },
    { id: 'missing' },
    { id: 'invalid', latitude: 91, longitude: 0 }
  ];
  const values = computeReportValues(index, reports, (report) => [report.latitude, report.longitude]);
  assert.deepEqual(values.get('inside'), [feature]);
  assert.deepEqual(values.get('outside'), []);
  assert.equal(values.get('missing'), null);
  assert.equal(values.get('invalid'), null);
});

test('discoverFields filters unsupported keys and naturally sorts values', () => {
  const collection = {
    type: 'FeatureCollection',
    features: [
      polygonFeature(null, {
        WardNo: 10,
        WardID: 'ETH_10',
        Ward_Label: 'Ward 10',
        Score: 1.5,
        ObjectID: 1,
        FID_1: 5,
        Shape_Leng: 20,
        Metadata: { name: 'x' },
        Empty: null,
        Constant: 'same'
      }),
      polygonFeature(null, {
        WardNo: 2,
        WardID: 'ETH_2',
        Ward_Label: 'Ward 2',
        Score: 2.5,
        ObjectID: 2,
        FID_1: 6,
        Shape_Leng: 21,
        Metadata: { name: 'y' },
        Empty: null,
        Constant: 'same'
      })
    ]
  };
  const fields = discoverFields(collection);
  assert.deepEqual(fields.map(({ key, label, type, values }) => ({ key, label, type, values })), [
    { key: 'WardID', label: 'Ward Id', type: 'string', values: ['ETH_2', 'ETH_10'] },
    { key: 'Ward_Label', label: 'Ward label', type: 'string', values: ['Ward 2', 'Ward 10'] },
    { key: 'WardNo', label: 'Ward No', type: 'integer', values: [2, 10] }
  ]);
});
