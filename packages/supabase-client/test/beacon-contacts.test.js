import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  listBeaconContacts,
  markBeaconContactMessagePrepared,
  saveBeaconContacts
} from '../src/beacon-contacts.js';
import { configureSupabaseClient } from '../src/client.js';
import { fileURLToPath } from 'node:url';

configureSupabaseClient({
  url: 'https://resident-test.supabase.co',
  anonKey: 'public-test-key'
});

test('Beacon contacts are loaded through a query scoped to their owner', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return new Response(JSON.stringify([{
      id: 'contact-1',
      name: 'Contact Example',
      phone: '+27123456789',
      phone_normalized: '27123456789',
      invitation_status: 'saved'
    }]), { status: 200 });
  };

  try {
    const contacts = await listBeaconContacts('resident-1');
    const url = new URL(requestUrl);
    assert.equal(url.pathname, '/rest/v1/beacon_contacts');
    assert.equal(url.searchParams.get('owner_id'), 'eq.resident-1');
    assert.equal(contacts[0].id, 'contact-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('explicitly selected Beacon contacts are upserted by normalized phone', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([{
      id: 'contact-1',
      name: 'Contact Example',
      phone: '+27 (12) 345-6789',
      phone_normalized: '27123456789',
      invitation_status: 'saved'
    }]), { status: 200 });
  };

  try {
    const contacts = await saveBeaconContacts('resident-1', [
      { name: 'Contact Example', phone: '+27 (12) 345-6789' },
      { name: 'Duplicate', phone: '+27 (12) 345-6789' }
    ]);
    const url = new URL(request.url);
    const body = JSON.parse(request.options.body);
    assert.equal(request.options.method, 'POST');
    assert.equal(url.searchParams.get('on_conflict'), 'owner_id,phone_normalized');
    assert.equal(request.options.headers.Prefer, 'resolution=merge-duplicates,return=representation');
    assert.equal(body.length, 1);
    assert.equal(body[0].owner_id, 'resident-1');
    assert.equal(body[0].phone_normalized, '27123456789');
    assert.equal(Object.hasOwn(body[0], 'invitation_status'), false);
    assert.equal(contacts[0].id, 'contact-1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid contact details and missing owners are rejected before network access', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response('[]', { status: 200 });
  };

  try {
    await assert.rejects(
      saveBeaconContacts('resident-1', [{ name: '', phone: '123' }]),
      /valid phone number/
    );
    await assert.rejects(listBeaconContacts(''), /Sign in/);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preparing an invite updates only the identified contact owned by the resident', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([{
      id: 'contact-1',
      invitation_status: 'message_prepared'
    }]), { status: 200 });
  };

  try {
    const contact = await markBeaconContactMessagePrepared('resident-1', 'contact-1');
    const url = new URL(request.url);
    const body = JSON.parse(request.options.body);
    assert.equal(request.options.method, 'PATCH');
    assert.equal(url.searchParams.get('id'), 'eq.contact-1');
    assert.equal(url.searchParams.get('owner_id'), 'eq.resident-1');
    assert.equal(body.invitation_status, 'message_prepared');
    assert.equal(typeof body.message_prepared_at, 'string');
    assert.equal(contact.invitation_status, 'message_prepared');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Beacon contact table applies owner-only row-level security', async () => {
  const migrationPath = new URL(
    '../../../supabase/migrations/0029_beacon_contacts.sql',
    import.meta.url
  );
  const migration = await readFile(fileURLToPath(migrationPath), 'utf8');

  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.uid\(\) = owner_id/g);
  assert.match(migration, /unique \(owner_id, phone_normalized\)/i);
  assert.match(migration, /to authenticated[\s\S]*?with check \(auth\.uid\(\) = owner_id\)/i);
  assert.match(migration, /revoke all on public\.beacon_contacts from anon, authenticated/i);
});
