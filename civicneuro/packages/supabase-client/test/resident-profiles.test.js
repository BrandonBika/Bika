import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getResidentProfile,
  updateResidentPreferences,
  updateResidentProfile
} from '../src/resident-profiles.js';
import { updateUserEmail } from '../src/auth.js';
import { configureSupabaseClient } from '../src/client.js';

configureSupabaseClient({
  url: 'https://resident-test.supabase.co',
  anonKey: 'public-test-key'
});

test('resident profile reads are scoped to the authenticated owner', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return new Response(JSON.stringify([{
      id: 'resident-1',
      full_name: 'Resident Example',
      report_status_updates_sms: true
    }]), { status: 200 });
  };

  try {
    const profile = await getResidentProfile('resident-1');
    const url = new URL(requestUrl);
    assert.equal(url.pathname, '/rest/v1/resident_profiles');
    assert.equal(url.searchParams.get('id'), 'eq.resident-1');
    assert.match(url.searchParams.get('select'), /report_status_updates_sms/);
    assert.equal(profile.full_name, 'Resident Example');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('profile updates write only approved columns and normalize phone digits', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([{ id: 'resident-1', full_name: 'Resident Example', phone: '27123456789' }]), { status: 200 });
  };

  try {
    await updateResidentProfile('resident-1', {
      full_name: ' Resident Example ',
      phone: '+27 (12) 345-6789',
      address: '14 Main Road'
    });
    const body = JSON.parse(request.options.body);
    assert.equal(request.options.method, 'PATCH');
    assert.equal(new URL(request.url).searchParams.get('id'), 'eq.resident-1');
    assert.deepEqual(body, {
      full_name: 'Resident Example',
      phone: '27123456789',
      address: '14 Main Road'
    });
    assert.equal(Object.hasOwn(body, 'email'), false);
    assert.equal(Object.hasOwn(body, 'privacy_consent_at'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('notification preference updates accept only boolean preference columns', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([{ id: 'resident-1', community_safety_alerts: false }]), { status: 200 });
  };

  try {
    await updateResidentPreferences('resident-1', { community_safety_alerts: false });
    assert.deepEqual(JSON.parse(request.options.body), { community_safety_alerts: false });
    await assert.rejects(
      updateResidentPreferences('resident-1', { full_name: 'Not a preference' }),
      /Unsupported resident profile field/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('protected profile fields and malformed updates are rejected before network access', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response('[]', { status: 200 });
  };

  try {
    await assert.rejects(
      updateResidentProfile('resident-1', { email: 'new@example.test' }),
      /Unsupported resident profile field/
    );
    await assert.rejects(
      updateResidentProfile('resident-1', { phone: '123' }),
      /valid phone number/
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('email changes are sent to Supabase Auth instead of the resident profile table', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ user: { email: 'new@example.test' } }), { status: 200 });
  };

  try {
    await updateUserEmail('new@example.test');
    assert.equal(request.url, 'https://resident-test.supabase.co/auth/v1/user');
    assert.equal(request.options.method, 'PUT');
    assert.deepEqual(JSON.parse(request.options.body), { email: 'new@example.test' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
