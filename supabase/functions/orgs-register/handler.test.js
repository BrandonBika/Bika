import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOrgsRegister } from './handler.js';

const user = { id: 'b8f2cd6b-8304-4e3e-b5ab-ddf26a2fd0ca' };

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createRequest(payload, token = 'valid-user-token') {
  return new Request('https://project.example.test/functions/v1/orgs-register', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

function env() {
  return {
    get(name) {
      return {
        SUPABASE_URL: 'https://project.example.test',
        SUPABASE_ANON_KEY: 'public-test-key',
        ALLOWED_ORIGINS: 'https://app.example.test'
      }[name] || '';
    }
  };
}

test('registration calls the authenticated registration RPC and returns pending status', async () => {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/auth/v1/user') return jsonResponse(user);
    if (url.pathname === '/rest/v1/rpc/register_organization') {
      const submitted = JSON.parse(options.body);
      assert.deepEqual(submitted, {
        p_name: 'Demo Municipality',
        p_type: 'municipality',
        p_jurisdiction_level: 'local',
        p_province: null,
        p_municipality: null
      });
      assert.equal(options.headers.Authorization, 'Bearer valid-user-token');
      return jsonResponse([{
        id: '4c4dfba0-25b5-44de-a2ab-172d20b63c19',
        name: submitted.p_name,
        status: 'pending'
      }]);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };

  const response = await handleOrgsRegister(createRequest({
    name: 'Demo Municipality',
    type: 'municipality',
    jurisdiction_level: 'local',
    submitted_by: '11111111-1111-4111-8111-111111111111',
    status: 'approved'
  }), { env: env(), fetchImpl });

  assert.equal(response.status, 201);
  assert.equal((await response.json()).organization.status, 'pending');
  assert.equal(calls.length, 2);
});

test('registration returns a conflict for an account already linked to an organization', async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return jsonResponse(user);
    if (url.pathname === '/rest/v1/rpc/register_organization') {
      return jsonResponse({ message: 'This account already belongs to an organization' }, 409);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const response = await handleOrgsRegister(createRequest({
    name: 'Another Municipality',
    type: 'municipality',
    jurisdiction_level: 'local'
  }), { env: env(), fetchImpl });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'ORGANIZATION_CONFLICT');
});

test('idempotent registration returns the existing approved organization', async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return jsonResponse(user);
    if (url.pathname === '/rest/v1/rpc/register_organization') {
      return jsonResponse([{
        id: '4c4dfba0-25b5-44de-a2ab-172d20b63c19',
        name: 'Existing Municipality',
        status: 'approved'
      }]);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const response = await handleOrgsRegister(createRequest({
    name: 'Existing Municipality',
    type: 'municipality',
    jurisdiction_level: 'local'
  }), { env: env(), fetchImpl });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).organization.status, 'approved');
});

test('registration rejects requests without a bearer token', async () => {
  const response = await handleOrgsRegister(createRequest({}, ''), {
    env: env(),
    fetchImpl: async () => {
      throw new Error('Authentication must not be called without a token');
    }
  });
  assert.equal(response.status, 401);
});