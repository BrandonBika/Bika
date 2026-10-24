import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReportsReassignOrg } from './handler.js';

const user = { id: 'b8f2cd6b-8304-4e3e-b5ab-ddf26a2fd0ca' };
const reportId = 'e71fd2c0-0b4d-4e75-957a-f0b0817a5c3a';
const organizationId = '4c4dfba0-25b5-44de-a2ab-172d20b63c19';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const env = {
  get(name) {
    return {
      SUPABASE_URL: 'https://project.example.test',
      SUPABASE_ANON_KEY: 'public-test-key',
      ALLOWED_ORIGINS: ''
    }[name] || '';
  }
};

function request(payload) {
  return new Request('https://project.example.test/functions/v1/reports-reassign-org', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer staff-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

test('reassignment passes the authenticated request to the approved-target RPC', async () => {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/auth/v1/user') return jsonResponse(user);
    if (url.pathname === '/rest/v1/rpc/staff_reassign_report') return jsonResponse('event-id');
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const response = await handleReportsReassignOrg(request({
    report_id: reportId,
    organization_id: organizationId,
    note: 'Approved route'
  }), { env, fetchImpl });

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_report_id: reportId,
    p_organization_id: organizationId,
    p_note: 'Approved route'
  });
  assert.equal(calls[1].options.headers.Authorization, 'Bearer staff-token');
});

test('reassignment rejects an unapproved target reported by the database', async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return jsonResponse(user);
    if (url.pathname === '/rest/v1/rpc/staff_reassign_report') return jsonResponse({}, 422);
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const response = await handleReportsReassignOrg(request({
    report_id: reportId,
    organization_id: organizationId
  }), { env, fetchImpl });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'REASSIGNMENT_REJECTED');
});