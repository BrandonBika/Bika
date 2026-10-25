import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOrganizationInvitationAccept } from './handler.js';

const user = {
  id: 'dd204a8d-b0b3-4d43-aa9d-7b20c6677162',
  email: 'employee@example.test'
};
const organizationId = '4c4dfba0-25b5-44de-a2ab-172d20b63c19';

function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function request(token = 'employee-token') {
  return new Request('https://project.example.test/functions/v1/orgs-invitation-accept', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
}

function environment() {
  return {
    get(name) {
      return {
        SUPABASE_URL: 'https://project.example.test',
        SUPABASE_ANON_KEY: 'public-test-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-test-key'
      }[name] || '';
    }
  };
}

test('acceptance RPC receives only identity verified from bearer token', async () => {
  let body;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return response(user);
    assert.equal(url.pathname, '/rest/v1/rpc/accept_organization_invitation');
    body = JSON.parse(options.body);
    return response(organizationId);
  };
  const result = await handleOrganizationInvitationAccept(request(), {
    env: environment(),
    fetchImpl
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, organization_id: organizationId });
  assert.deepEqual(body, { p_user_id: user.id, p_email: user.email });
});

test('expired and invalid invitations return an expired response', async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/auth/v1/user') return response(user);
    return response({ message: 'Invitation is invalid or expired' }, 400);
  };
  const result = await handleOrganizationInvitationAccept(request(), {
    env: environment(),
    fetchImpl
  });
  assert.equal(result.status, 410);
  assert.equal((await result.json()).code, 'INVITATION_INVALID_OR_EXPIRED');
});

test('acceptance rejects requests without a verified bearer identity', async () => {
  const result = await handleOrganizationInvitationAccept(request(''), {
    env: environment(),
    fetchImpl: async () => { throw new Error('must not authenticate without a token'); }
  });
  assert.equal(result.status, 401);
});
