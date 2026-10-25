import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOrgsInvite } from './handler.js';

const adminId = 'b8f2cd6b-8304-4e3e-b5ab-ddf26a2fd0ca';
const organizationId = '4c4dfba0-25b5-44de-a2ab-172d20b63c19';
const employeeId = 'dd204a8d-b0b3-4d43-aa9d-7b20c6677162';
const origin = 'https://app.example.test';

function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function request(email, token = 'admin-token', requestOrigin = origin) {
  return new Request('https://project.example.test/functions/v1/orgs-invite', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email })
  });
}

function environment() {
  return {
    get(name) {
      return {
        SUPABASE_URL: 'https://project.example.test',
        SUPABASE_ANON_KEY: 'public-test-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
        ALLOWED_ORIGINS: origin
      }[name] || '';
    }
  };
}

function createFetch({ role = 'org_admin', active = true } = {}, calls = []) {
  return async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url, options });
    if (url.pathname === '/auth/v1/user') return response({ id: adminId });
    if (url.pathname === '/rest/v1/organization_members') {
      return response([{ organization_id: organizationId, role, is_active: active }]);
    }
    if (url.pathname === '/rest/v1/organizations') {
      return response([{ id: organizationId, status: 'approved', is_active: true }]);
    }
    if (url.pathname === '/auth/v1/invite') return response({ id: employeeId }, 200);
    if (url.pathname === '/rest/v1/organization_invitations') return response(null, 201);
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
}

test('organisation admin invitation derives organisation from verified membership', async () => {
  const calls = [];
  const result = await handleOrgsInvite(request('  Employee@Example.test  '), {
    env: environment(),
    fetchImpl: createFetch({}, calls)
  });

  assert.equal(result.status, 201);
  assert.deepEqual(await result.json(), { ok: true, expires_in_days: 7 });
  const invite = calls.find(({ url }) => url.pathname === '/auth/v1/invite');
  assert.equal(invite.url.searchParams.get('redirect_to'), `${origin}/org-dashboard/?page=invitation`);
  assert.equal(JSON.parse(invite.options.body).email, 'employee@example.test');
  const row = calls.find(({ url }) => url.pathname === '/rest/v1/organization_invitations');
  assert.deepEqual(JSON.parse(row.options.body), {
    organization_id: organizationId,
    invited_user_id: employeeId,
    email: 'employee@example.test',
    invited_by: adminId
  });
});

test('employees cannot create organisation invitations', async () => {
  const result = await handleOrgsInvite(request('employee@example.test'), {
    env: environment(),
    fetchImpl: createFetch({ role: 'org_employee' })
  });
  assert.equal(result.status, 403);
  assert.equal((await result.json()).code, 'ORGANIZATION_ADMIN_REQUIRED');
});

test('requests from unapproved origins and invalid email addresses are rejected', async () => {
  const badOrigin = await handleOrgsInvite(request('employee@example.test', 'admin-token', 'https://evil.example'), {
    env: environment(),
    fetchImpl: async () => { throw new Error('must not authenticate an unapproved origin'); }
  });
  assert.equal(badOrigin.status, 403);

  const badEmail = await handleOrgsInvite(request('not-an-email'), {
    env: environment(),
    fetchImpl: async (input) => {
      if (new URL(String(input)).pathname === '/auth/v1/user') return response({ id: adminId });
      throw new Error('must not query membership for an invalid email');
    }
  });
  assert.equal(badEmail.status, 422);
});

test('requests without a bearer token are rejected', async () => {
  const result = await handleOrgsInvite(request('employee@example.test', ''), {
    env: environment(),
    fetchImpl: async () => { throw new Error('must not authenticate without a token'); }
  });
  assert.equal(result.status, 401);
});
