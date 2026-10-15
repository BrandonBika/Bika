import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  listLifelineCards,
  saveLifelineCard
} from '../src/lifeline-cards.js';
import { configureSupabaseClient } from '../src/client.js';

configureSupabaseClient({
  url: 'https://resident-test.supabase.co',
  anonKey: 'public-test-key'
});

const card = {
  id: 'group-family',
  name: 'Family',
  icon: 'custom',
  color: '#EAF3DE',
  members: [{ id: 'member-1', name: 'Resident Contact', phone: '063 123 4567' }]
};

test('Lifeline groups load through an authenticated owner-scoped table query', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = String(url);
    return new Response(JSON.stringify([{ ...card, owner_id: 'resident-1' }]), { status: 200 });
  };

  try {
    const cards = await listLifelineCards('resident-1');
    const url = new URL(requestUrl);
    assert.equal(url.pathname, '/rest/v1/lifeline_cards');
    assert.equal(url.searchParams.get('owner_id'), 'eq.resident-1');
    assert.equal(cards[0].name, 'Family');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Lifeline groups save with the resident owner and validated members', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify([{ ...card, owner_id: 'resident-1' }]), { status: 201 });
  };

  try {
    const saved = await saveLifelineCard('resident-1', card);
    const url = new URL(request.url);
    const body = JSON.parse(request.options.body);
    assert.equal(request.options.method, 'POST');
    assert.equal(url.searchParams.get('on_conflict'), 'owner_id,id');
    assert.equal(request.options.headers.Prefer, 'resolution=merge-duplicates,return=representation');
    assert.equal(body[0].owner_id, 'resident-1');
    assert.equal(body[0].members[0].phone, '063 123 4567');
    assert.equal(saved.id, 'group-family');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Lifeline group save rejects more than four members before making a request', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response('[]', { status: 200 });
  };

  try {
    await assert.rejects(
      saveLifelineCard('resident-1', {
        ...card,
        members: Array.from({ length: 5 }, (_, index) => ({
          id: `member-${index}`,
          name: 'Contact',
          phone: '0631234567'
        }))
      }),
      /between 1 and 4/
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('missing Lifeline table errors explain the required database migration', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 'PGRST205',
    message: "Could not find the table 'public.lifeline_cards' in the schema cache"
  }), { status: 404 });

  try {
    await assert.rejects(
      listLifelineCards('resident-1'),
      /run supabase\/migrations\/0030_lifeline_cards\.sql/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Lifeline table uses authenticated owner-only row-level security', async () => {
  const migrationPath = new URL(
    '../../../supabase/migrations/0030_lifeline_cards.sql',
    import.meta.url
  );
  const migration = await readFile(fileURLToPath(migrationPath), 'utf8');

  assert.match(migration, /enable row level security/i);
  assert.match(migration, /auth\.uid\(\) = owner_id/g);
  assert.match(migration, /primary key \(owner_id, id\)/i);
  assert.match(migration, /jsonb_array_length\(members\) between 1 and 4/i);
  assert.match(migration, /revoke all on public\.lifeline_cards from anon, authenticated/i);
});
