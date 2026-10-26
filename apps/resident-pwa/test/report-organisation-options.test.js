import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadReportOrganisationOptions,
  mapReportOrganisationOptions,
  UNSURE_REPORT_ORGANISATION
} from '../src/features/reports/organisation-options.js';

test('loads organisation options from the approved-organisations RPC in name order', async () => {
  let requestDetails;
  const options = await loadReportOrganisationOptions(async (...args) => {
    requestDetails = args;
    return [
      { id: 'org-z', name: 'Zulu Services' },
      { id: 'org-a', name: 'Alpha Services' }
    ];
  }, () => assert.fail('A successful organisation list should not log an error.'));

  assert.deepEqual(requestDetails, [
    '/rest/v1/rpc/list_report_organisations',
    { method: 'POST', body: {}, auth: false }
  ]);
  assert.deepEqual(options, [
    UNSURE_REPORT_ORGANISATION,
    { id: 'org-a', name: 'Alpha Services' },
    { id: 'org-z', name: 'Zulu Services' }
  ]);
});

test('excludes pending, rejected, and inactive organisations', () => {
  assert.deepEqual(mapReportOrganisationOptions([
    { id: 'approved', name: 'Approved', status: 'approved', is_active: true },
    { id: 'pending', name: 'Pending', status: 'pending', is_active: false },
    { id: 'rejected', name: 'Rejected', status: 'rejected', is_active: false },
    { id: 'inactive', name: 'Inactive', status: 'approved', is_active: false }
  ]), [
    UNSURE_REPORT_ORGANISATION,
    { id: 'approved', name: 'Approved' }
  ]);
});

test('falls back to only Unsure and logs when the organisation fetch fails', async () => {
  const errors = [];
  const options = await loadReportOrganisationOptions(
    async () => { throw new Error('network unavailable'); },
    (...args) => errors.push(args)
  );

  assert.deepEqual(options, [UNSURE_REPORT_ORGANISATION]);
  assert.equal(errors[0][0], '[report] Could not load approved organisations.');
  assert.match(errors[0][1].message, /network unavailable/);
});

test('falls back to only Unsure and logs when no organisations are returned', async () => {
  const errors = [];
  const options = await loadReportOrganisationOptions(
    async () => [],
    (...args) => errors.push(args)
  );

  assert.deepEqual(options, [UNSURE_REPORT_ORGANISATION]);
  assert.equal(errors[0][0], '[report] No approved organisations were returned.');
});
