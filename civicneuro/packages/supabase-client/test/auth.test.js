import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAccessToken,
  signInWithPassword,
  signUp
} from '../src/auth.js';
import { configureSupabaseClient, selectRows } from '../src/client.js';

configureSupabaseClient({
  url: 'https://resident-test.supabase.co',
  anonKey: 'public-test-key'
});

test('password sign-in sends credentials to Supabase Auth and stores the in-memory session', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({
      access_token: 'resident-access-token',
      refresh_token: 'resident-refresh-token',
      user: { id: 'resident-1', email: 'resident@example.test' }
    }), { status: 200 });
  };

  try {
    const result = await signInWithPassword({
      email: 'resident@example.test',
      password: 'correct horse battery staple'
    });
    assert.equal(request.url, 'https://resident-test.supabase.co/auth/v1/token?grant_type=password');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.apikey, 'public-test-key');
    assert.equal(JSON.parse(request.options.body).email, 'resident@example.test');
    assert.equal(getAccessToken(), 'resident-access-token');
    assert.equal(result.user.id, 'resident-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sign-up asks Supabase to redirect verification links to the configured PWA', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ user: { id: 'resident-2' }, session: null }), { status: 200 });
  };

  try {
    await signUp({
      email: 'resident@example.test',
      password: 'correct horse battery staple',
      metadata: { full_name: 'Resident Example' },
      emailRedirectTo: 'https://resident.example.test/'
    });
    assert.equal(request.url, 'https://resident-test.supabase.co/auth/v1/signup?redirect_to=https%3A%2F%2Fresident.example.test%2F');
    assert.equal(JSON.parse(request.options.body).data.full_name, 'Resident Example');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resident profile reads use the authenticated PostgREST endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([{ id: 'resident-1', full_name: 'Resident Example' }]), { status: 200 });
  };

  try {
    const rows = await selectRows('resident_profiles', { id: 'resident-1' });
    const url = new URL(request.url);
    assert.equal(url.pathname, '/rest/v1/resident_profiles');
    assert.equal(url.searchParams.get('id'), 'eq.resident-1');
    assert.equal(request.options.headers.Authorization, 'Bearer resident-access-token');
    assert.equal(rows[0].full_name, 'Resident Example');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refresh retries an expired authenticated request with the refreshed access token', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/auth/v1/token?grant_type=refresh_token')) {
      return new Response(JSON.stringify({
        access_token: 'refreshed-access-token',
        refresh_token: 'rotated-refresh-token',
        user: { id: 'resident-1', email: 'resident@example.test' }
      }), { status: 200 });
    }
    if (requests.length === 1) return new Response('{"message":"JWT expired"}', { status: 401 });
    return new Response(JSON.stringify([{ id: 'resident-1' }]), { status: 200 });
  };

  try {
    const rows = await selectRows('resident_profiles', { id: 'resident-1' });
    assert.equal(rows[0].id, 'resident-1');
    assert.equal(requests[0].options.headers.Authorization, 'Bearer resident-access-token');
    assert.equal(requests[1].url, 'https://resident-test.supabase.co/auth/v1/token?grant_type=refresh_token');
    assert.equal(requests[2].options.headers.Authorization, 'Bearer refreshed-access-token');
    assert.equal(getAccessToken(), 'refreshed-access-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
