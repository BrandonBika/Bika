import test from 'node:test';
import assert from 'node:assert/strict';
import { handleZegoToken } from './handler.js';

const options = {
  env: { ZEGO_APP_ID: '123456789', ZEGO_SERVER_SECRET: '0123456789abcdef0123456789abcdef' },
  supabaseUrl: 'https://test-project.supabase.co',
  anonKey: 'public-test-key'
};

test('rejects a missing Supabase access token without contacting auth', async () => {
  let fetchCalls = 0;
  const response = await handleZegoToken(new Request('https://app.test/api/zego-token', {
    method: 'POST'
  }), { ...options, fetchImpl: async () => { fetchCalls++; } });
  assert.equal(response.status, 401);
  assert.equal(fetchCalls, 0);
});

test('rejects an invalid Supabase access token', async () => {
  const response = await handleZegoToken(new Request('https://app.test/api/zego-token', {
    method: 'POST',
    headers: { authorization: 'Bearer invalid-token' }
  }), { ...options, fetchImpl: async () => new Response('{}', { status: 401 }) });
  assert.equal(response.status, 401);
});

test('generates a token04 for the verified Supabase user and never returns the secret', async () => {
  const response = await handleZegoToken(new Request('https://app.test/api/zego-token', {
    method: 'POST',
    headers: { authorization: 'Bearer valid-token' }
  }), {
    ...options,
    fetchImpl: async (url, init) => {
      assert.equal(String(url), 'https://test-project.supabase.co/auth/v1/user');
      assert.equal(init.headers.authorization, 'Bearer valid-token');
      return Response.json({ id: '123e4567-e89b-42d3-a456-426614174000' });
    }
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.appId, 123456789);
  assert.equal(body.userId, '123e4567e89b42d3a456426614174000');
  assert.match(body.token, /^04[A-Za-z0-9+/]+=*$/);
  assert.equal(body.expiresIn, 3600);
  assert.equal(JSON.stringify(body).includes(options.env.ZEGO_SERVER_SECRET), false);
});

test('rejects anonymous Supabase sessions', async () => {
  const response = await handleZegoToken(new Request('https://app.test/api/zego-token', {
    method: 'POST',
    headers: { authorization: 'Bearer test-access-token' }
  }), {
    ...options,
    fetchImpl: async () => Response.json({ id: 'verified-user-id', is_anonymous: true })
  });
  assert.equal(response.status, 401);
});

test('maps a verified Supabase UUID to a 32-character Zego user ID', async () => {
  const response = await handleZegoToken(new Request('https://app.test/api/zego-token', {
    method: 'POST',
    headers: { authorization: 'Bearer test-access-token' }
  }), {
    ...options,
    fetchImpl: async () => Response.json({ id: '123e4567-e89b-42d3-a456-426614174000' })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.userId, '123e4567e89b42d3a456426614174000');
});
