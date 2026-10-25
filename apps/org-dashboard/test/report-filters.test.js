import test from 'node:test';
import assert from 'node:assert/strict';
import { reportsForTab } from '../src/features/reports/report-filters.js';

const reports = [
  { id: 'active', status: 'In Progress' },
  { id: 'resolved', status: 'Resolved' },
  { id: 'rejected', status: 'Rejected' },
  { id: 'duplicate', status: 'Duplicate' }
];

test('active report tab excludes resolved, rejected, and duplicate reports', () => {
  assert.deepEqual(reportsForTab(reports, 'active').map((report) => report.id), ['active']);
});

test('historical report tab includes resolved, rejected, and duplicate reports', () => {
  assert.deepEqual(
    reportsForTab(reports, 'historical').map((report) => report.id),
    ['resolved', 'rejected', 'duplicate']
  );
});

test('report tabs show honest empty lists', () => {
  assert.deepEqual(reportsForTab([], 'active'), []);
  assert.deepEqual(reportsForTab(null, 'historical'), []);
});
