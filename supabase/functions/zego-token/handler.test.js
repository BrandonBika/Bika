import test from 'node:test';
import assert from 'node:assert/strict';
import { handleZegoToken } from './handler.js';

const CALLER_ID = '123e4567-e89b-42d3-a456-426614174000';
const RECIPIENT_ID = '123e4567-e89b-42d3-a456-426614174001';
const OTHER_ID = '123e4567-e89b-42d3-a456-426614174002';
const options = {
  env: { ZEGO_APP_ID: '123456789', ZEGO_SERVER_SECRET: '0123456789abcdef0123456789abcdef' },
  supabaseUrl: 'https://test-project.supabase.co',
  anonKey: 'public-test-key'
};

function request(recipientIds = [RECIPIENT_ID], authorization = 'Bearer test-access-token') {
  return new Request('https://app.test/api/zego-token', {
    method: 'POST',
    headers: {
      authorization,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ recipientIds })
  });
}

function relationshipFetch({
  user = { id: CALLER_ID },
  connections = [{ requester_id: CALLER_ID, addressee_id: RECIPIENT_ID }],
  blocks = []
} = {}) {
  return async (url, init) => {
    const parsed = new URL(url);
    assert.equal(init.headers.apikey, options.anonKey);
    assert.equal(init.headers.authorization, 'Bearer test-access-token');
    if (parsed.pathname === '/auth/v1/user') return Response.json(user);
    if (parsed.pathname === '/rest/v1/beacon_connections') {
      assert.equal(parsed.searchParams.get('status'), 'eq.accepted');
      assert.equal(parsed.searchParams.get('or'),
        `(requester_id.eq.${CALLER_ID},addressee_id.eq.${CALLER_ID})`);
      return Response.json(connections);
    }
    if (parsed.pathname === '/rest/v1/beacon_blocks') {
      assert.equal(parsed.searchParams.get('or'),
        `(blocker_id.eq.${CALLER_ID},blocked_id.eq.${CALLER_ID})`);
      return Response.json(blocks);
    }
    throw new Error('Unexpected Supabase request.');
  };
}

test('rejects a missing Supabase access token without contacting auth', async () => {
  let fetchCalls = 0;
  const response = await handleZegoToken(request([RECIPIENT_ID], ''), {
    ...options,
    fetchImpl: async () => { fetchCalls++; }
  });
  assert.equal(response.status, 401);
  assert.equal(fetchCalls, 0);
});

test('rejects an invalid Supabase access token', async () => {
  const response = await handleZegoToken(request(), {
    ...options,
    fetchImpl: async () => new Response('{}', { status: 401 })
  });
  assert.equal(response.status, 401);
});

test('requires a recipient list array', async () => {
  const response = await handleZegoToken(request(null), {
    ...options,
    fetchImpl: relationshipFetch()
  });
  assert.equal(response.status, 400);
});

test('issues a login token without recipient lookups when the authenticated caller has no circle members', async () => {
  let recipientLookups = 0;
  const response = await handleZegoToken(request([]), {
    ...options,
    fetchImpl: async (url, init) => {
      const parsed = new URL(url);
      if (parsed.pathname === '/auth/v1/user') return Response.json({ id: CALLER_ID });
      recipientLookups++;
      throw new Error('Empty-recipient login should not query recipient relations.');
    }
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.userId, '123e4567e89b42d3a456426614174000');
  assert.equal(recipientLookups, 0);
});

test('rejects anonymous Supabase sessions', async () => {
  const response = await handleZegoToken(request(), {
    ...options,
    fetchImpl: relationshipFetch({ user: { id: CALLER_ID, is_anonymous: true } })
  });
  assert.equal(response.status, 401);
});

test('rejects recipients without an accepted connection', async () => {
  const response = await handleZegoToken(request(), {
    ...options,
    fetchImpl: relationshipFetch({ connections: [] })
  });
  assert.equal(response.status, 403);
});

test('rejects recipients blocked by either side', async () => {
  const response = await handleZegoToken(request(), {
    ...options,
    fetchImpl: relationshipFetch({
      blocks: [{ blocker_id: RECIPIENT_ID, blocked_id: CALLER_ID }]
    })
  });
  assert.equal(response.status, 403);
});

test('generates a token only for a verified caller and accepted, unblocked recipient', async () => {
  const response = await handleZegoToken(request(), {
    ...options,
    fetchImpl: relationshipFetch()
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.appId, 123456789);
  assert.equal(body.userId, '123e4567e89b42d3a456426614174000');
  assert.match(body.token, /^04[A-Za-z0-9+/]+=*$/);
  assert.equal(body.expiresIn, 3600);
  assert.equal(JSON.stringify(body).includes(options.env.ZEGO_SERVER_SECRET), false);
});

test('does not authorize a different recipient from the request body', async () => {
  const response = await handleZegoToken(request([OTHER_ID]), {
    ...options,
    fetchImpl: relationshipFetch()
  });
  assert.equal(response.status, 403);
});

test('maps the verified Supabase UUID to a 32-character Zego user ID', async () => {
  const response = await handleZegoToken(request(), {
    ...options,
    fetchImpl: relationshipFetch()
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.userId, '123e4567e89b42d3a456426614174000');
});
