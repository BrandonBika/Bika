import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundaryEvaluationContext,
  cacheBoundaryLookup,
  getBoundaryLookup,
  invalidateBoundaryLookup
} from '../src/features/boundary-cache.js';
import { compileTree, OUTSIDE_BOUNDARY } from '../src/features/filter-engine.js';
import { reportCoordinates } from '../src/features/report-coordinates.js';

const geojson = (ward) => ({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { Ward: ward },
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
    }
  }]
});
test('boundary cache is reused per boundary path and reports array identity', () => {
  const path = 'cache-identity-test.geojson';
  const reports = [{ id: 'inside', latitude: 5, longitude: 5 }];
  const first = cacheBoundaryLookup(path, reports, geojson('A'), reportCoordinates);
  const second = cacheBoundaryLookup(path, reports, geojson('B'), reportCoordinates);
  const separateReports = [{ ...reports[0] }];
  const separate = cacheBoundaryLookup(path, separateReports, geojson('C'), reportCoordinates);

  assert.equal(first, second);
  assert.notEqual(first, separate);
  assert.equal(getBoundaryLookup(path, reports), first);
  assert.deepEqual(boundaryEvaluationContext(path, reports).boundaryValue('Ward', reports[0]), ['A']);
  assert.deepEqual(boundaryEvaluationContext(path, separateReports).boundaryValue('Ward', separateReports[0]), ['C']);
  invalidateBoundaryLookup(path);
  assert.equal(getBoundaryLookup(path, reports), null);
  const replaced = cacheBoundaryLookup(path, reports, geojson('B'), reportCoordinates);
  assert.notEqual(replaced, first);
  assert.deepEqual(boundaryEvaluationContext(path, reports).boundaryValue('Ward', reports[0]), ['B']);
  invalidateBoundaryLookup(path);
});

test('reports without coordinates do not match a ward or Outside boundary', () => {
  const path = 'cache-missing-coordinates-test.geojson';
  const reports = [
    { id: 'missing' },
    { id: 'outside', latitude: 20, longitude: 20 },
    { id: 'primary', latitude: 5, longitude: 5 },
    { id: 'fallback', location_lat: 5, location_lng: 5 }
  ];
  cacheBoundaryLookup(path, reports, geojson('A'), reportCoordinates);
  const context = boundaryEvaluationContext(path, reports);
  const outsideCondition = compileTree({
    type: 'condition',
    field: 'boundary:Ward',
    operator: 'is',
    value: OUTSIDE_BOUNDARY,
    negate: false
  }, {
    now: new Date('2026-10-24T00:00:00.000Z'),
    getCategory: () => 'Uncategorised',
    fields: [{ field: 'boundary:Ward', key: 'Ward', label: 'Ward', values: ['A', 'B'] }],
    ...context
  });

  assert.equal(context.boundaryFeature(reports[0]), undefined);
  assert.equal(context.boundaryValue('Ward', reports[0]), undefined);
  assert.equal(outsideCondition(reports[0]), false);
  assert.deepEqual(context.boundaryFeature(reports[1]), []);
  assert.equal(outsideCondition(reports[1]), true);
  assert.deepEqual(reportCoordinates(reports[2]), [5, 5]);
  assert.deepEqual(reportCoordinates(reports[3]), [5, 5]);
  assert.equal(context.boundaryFeature(reports[2]).length, 1);
  assert.equal(context.boundaryFeature(reports[3]).length, 1);
  invalidateBoundaryLookup(path);
});

test('overlapping boundary features satisfy is-any, is-not-none, and outside checks', () => {
  const path = 'cache-overlap-test.geojson';
  const reports = [
    { id: 'overlap', latitude: 5, longitude: 5 },
    { id: 'outside', latitude: 20, longitude: 20 }
  ];
  const overlappingGeojson = {
    type: 'FeatureCollection',
    features: [
      ...geojson('Ward A').features,
      {
        type: 'Feature',
        properties: { Ward: 'Ward B' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]]]
        }
      }
    ]
  };
  cacheBoundaryLookup(path, reports, overlappingGeojson, reportCoordinates);
  const context = {
    now: new Date('2026-10-24T00:00:00.000Z'),
    getCategory: () => 'Uncategorised',
    fields: [{ field: 'boundary:Ward', key: 'Ward', label: 'Ward', values: ['Ward A', 'Ward B'] }],
    ...boundaryEvaluationContext(path, reports)
  };
  const compile = (operator, value) => compileTree({
    type: 'condition',
    field: 'boundary:Ward',
    operator,
    value,
    negate: false
  }, context);

  assert.equal(context.boundaryFeature(reports[0]).length, 2);
  assert.equal(compile('is', 'Ward B')(reports[0]), true);
  assert.equal(compile('is not', 'Ward C')(reports[0]), true);
  assert.equal(compile('is not', 'Ward A')(reports[0]), false);
  assert.equal(compile('is', OUTSIDE_BOUNDARY)(reports[1]), true);
  assert.equal(compile('is', OUTSIDE_BOUNDARY)(reports[0]), false);
  invalidateBoundaryLookup(path);
});
