import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOrgsApprove } from './handler.js';

const user = { id: 'b8f2cd6b-8304-4e3e-b5ab-ddf26a2fd0ca' };
const organizationId = '4c4dfba0-25b5-44de-a2ab-172d20b63c19';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function request(payload) {
  return new Request('https://project.example.test/functions/v1/orgs-approve', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
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

test('approval calls the audited database RPC with the caller bearer token', async () => {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/auth/v1/user') return jsonResponse(user);
    if (url.pathname === '/rest/v1/rpc/approve_organization') return jsonResponse('audit-event-id');
    throw new Error(`Unexpected request: ${url.pathname}`);
  };

  const response = await handleOrgsApprove(request({
    organization_id: organizationId,
    status: 'approved'
  }), { env, fetchImpl });

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    p_organization_id: organizationId,
    p_new_status: 'approved'
  });
  assert.equal(calls[1].options.headers.Authorization, 'Bearer user-token');
});

test('a non-admin rejected by the database RPC cannot approve', async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return jsonResponse(user);
    if (url.pathname === '/rest/v1/rpc/approve_organization') return jsonResponse({}, 403);
    throw new Error(`Unexpected request: ${url.pathname}`);
  };

  const response = await handleOrgsApprove(request({
    organization_id: organizationId,
    status: 'approved'
  }), { env, fetchImpl });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'PLATFORM_ADMIN_REQUIRED');
});