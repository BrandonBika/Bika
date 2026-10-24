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

test('registration derives submitter from the bearer token and returns pending status', async () => {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/auth/v1/user') return jsonResponse(user);
    if (url.pathname === '/rest/v1/organizations') {
      const submitted = JSON.parse(options.body);
      assert.equal(submitted.submitted_by, user.id);
      assert.equal(Object.hasOwn(submitted, 'status'), false);
      return jsonResponse([{
        id: '4c4dfba0-25b5-44de-a2ab-172d20b63c19',
        name: submitted.name,
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

test('registration rejects requests without a bearer token', async () => {
  const response = await handleOrgsRegister(createRequest({}, ''), {
    env: env(),
    fetchImpl: async () => {
      throw new Error('Authentication must not be called without a token');
    }
  });
  assert.equal(response.status, 401);
});