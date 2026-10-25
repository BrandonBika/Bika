import test from 'node:test';
import assert from 'node:assert/strict';
import { handleTranscribe } from './handler.js';

const env = {
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY: 'public-test-key'
};

test('rejects a missing bearer token without contacting Supabase', async () => {
  let fetchCalls = 0;
  const response = await handleTranscribe(new Request('https://app.test/transcribe', {
    method: 'POST'
  }), { env, fetchImpl: async () => { fetchCalls++; } });

  assert.equal(response.status, 401);
  assert.equal(fetchCalls, 0);
});

test('rejects an invalid bearer token', async () => {
  const response = await handleTranscribe(new Request('https://app.test/transcribe', {
    method: 'POST',
    headers: { authorization: 'Bearer invalid' }
  }), {
    env,
    fetchImpl: async () => new Response('{}', { status: 401 })
  });

  assert.equal(response.status, 401);
});

test('authenticated requests cannot invoke the disabled transcribe stub or choose another user', async () => {
  let fetchCalls = 0;
  const response = await handleTranscribe(new Request('https://app.test/transcribe', {
    method: 'POST',
    headers: {
      authorization: 'Bearer verified-user-token',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ user_id: 'another-user-id' })
  }), {
    env,
    fetchImpl: async (url) => {
      fetchCalls++;
      assert.equal(String(url), 'https://test-project.supabase.co/auth/v1/user');
      return Response.json({ id: 'verified-user-id', is_anonymous: false });
    }
  });
  const body = await response.json();

  assert.equal(response.status, 410);
  assert.equal(body.code, 'TRANSCRIPTION_DISABLED');
  assert.equal(fetchCalls, 1);
});

test('does not accept anonymous Supabase sessions', async () => {
  const response = await handleTranscribe(new Request('https://app.test/transcribe', {
    method: 'POST',
    headers: { authorization: 'Bearer anonymous-token' }
  }), {
    env,
    fetchImpl: async () => Response.json({ id: 'anonymous-user-id', is_anonymous: true })
  });

  assert.equal(response.status, 401);
});