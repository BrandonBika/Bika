import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTree } from '../src/features/filter-engine.js';
import { filterReportCandidates } from '../src/features/report-sheet-filters.js';

test('candidate filters combine organisation, assignment, query, then search', () => {
  const reports = [
    { id: 'kept', assigned_organization_id: 'org-1', recommended_organization_id: 'org-2', queryMatch: true, tracking_number: 'R-1', description: 'Broken pipe' },
    { id: 'wrong-org', assigned_organization_id: 'org-2', queryMatch: true, tracking_number: 'R-1', description: 'Broken pipe' },
    { id: 'assigned-not-flagged', assigned_organization_id: 'org-1', recommended_organization_id: 'org-1', queryMatch: true, tracking_number: 'R-1', description: 'Broken pipe' },
    { id: 'query-rejected', assigned_organization_id: 'org-1', recommended_organization_id: 'org-2', queryMatch: false, tracking_number: 'R-1', description: 'Broken pipe' },
    { id: 'search-rejected', assigned_organization_id: 'org-1', recommended_organization_id: 'org-2', queryMatch: true, tracking_number: 'R-2', description: 'Blocked road' },
    { id: 'historical', status: 'Resolved', assigned_organization_id: 'org-1', recommended_organization_id: 'org-2', queryMatch: true, tracking_number: 'R-3', description: 'Broken pipe' }
  ];

  const queried = [];
  const candidates = filterReportCandidates(reports, {
    organization: 'org-1',
    unassigned: true,
    queryPredicate: (report) => {
      queried.push(report.id);
      return report.queryMatch;
    },
    search: 'broken'
  });

  assert.deepEqual(candidates.map((report) => report.id), ['kept', 'historical']);
  assert.deepEqual(queried, ['kept', 'query-rejected', 'search-rejected', 'historical']);
  assert.ok(candidates.some((report) => report.status === 'Resolved'));
  assert.equal(candidates.length, 2);
});

test('candidate filters preserve historical reports and compute the full candidate set before tab splitting', () => {
  const reports = [
    { id: 'active', status: 'Open', assigned_organization_id: 'org-1', queryMatch: true },
    { id: 'resolved', status: 'Resolved', assigned_organization_id: 'org-1', queryMatch: true },
    { id: 'rejected', status: 'Rejected', assigned_organization_id: 'org-1', queryMatch: true },
    { id: 'duplicate', status: 'Duplicate', assigned_organization_id: 'org-1', queryMatch: true }
  ];
  const statusQuery = compileTree({
    type: 'group',
    combinator: 'AND',
    negate: false,
    children: [{
      type: 'condition',
      field: 'status',
      operator: 'is not',
      value: 'Open',
      negate: false
    }]
  }, {
    now: new Date('2026-10-24T00:00:00.000Z'),
    getCategory: () => 'Uncategorised'
  });
  const candidates = filterReportCandidates(reports, {
    organization: 'org-1',
    queryPredicate: statusQuery
  });
  const activeCount = candidates.filter((report) =>
    !['Resolved', 'Rejected', 'Duplicate'].includes(report.status)).length;
  const historicalCount = candidates.length - activeCount;

  assert.equal(candidates.length, 3);
  assert.equal(activeCount, 0);
  assert.equal(historicalCount, 3);
  assert.deepEqual(candidates.map((report) => report.status), ['Resolved', 'Rejected', 'Duplicate']);
});
