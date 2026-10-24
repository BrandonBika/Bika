import fs from 'node:fs';
import path from 'node:path';
import {
  createDatabaseClient,
  loadDevConfig,
  repoRoot,
  safeError
} from './dev-supabase-test-helpers.js';

const config = loadDevConfig();
const labels = ['A', 'B', 'C'];
const displayNames = {
  A: 'Amara Nkosi',
  B: 'Sipho Dlamini',
  C: 'Lerato Mthembu'
};
const accounts = Object.fromEntries(labels.map((label) => [label, {
  email: config.env.get(`TEST_USER_${label}_EMAIL`),
  password: config.env.get('TEST_USER_PASSWORD')
}]));
if (Object.values(accounts).some(({ email, password }) => !email || !password)) {
  throw new Error('.env.test is missing A/B/C dashboard test credentials.');
}

const manifestDir = path.join(repoRoot, '.artifacts', 'demo-seed');
const manifestPath = path.join(manifestDir, 'seed-manifest.json');
const db = createDatabaseClient(config.databaseUrl);

function saveManifest(manifest) {
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function signIn(label) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      email: accounts[label].email,
      password: accounts[label].password
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token || !payload?.user?.id) {
    const errorCode = payload?.error_code || payload?.code || 'unspecified';
    throw new Error(`Dev dashboard account ${label} sign-in failed (${response.status}, ${errorCode}).`);
  }
  return { id: payload.user.id, token: payload.access_token };
}

async function rpc(token, name, body) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Dev Supabase ${name} failed (${response.status}): ${payload?.message || 'unknown error'}`);
  }
  return Array.isArray(payload) ? payload[0] : payload;
}

async function findUsers() {
  const result = await db.query(
    'SELECT id, lower(email) AS email_key FROM auth.users WHERE lower(email) = ANY($1::text[])',
    [labels.map((label) => accounts[label].email.toLowerCase())]
  );
  if (result.rowCount !== labels.length) {
    throw new Error('Safety check stopped: expected all three existing dashboard auth users in the dev project.');
  }
  const byEmail = new Map(result.rows.map((row) => [row.email_key, row.id]));
  const users = Object.fromEntries(labels.map((label) => [
    label,
    byEmail.get(accounts[label].email.toLowerCase())
  ]));
  if (new Set(Object.values(users)).size !== labels.length) {
    throw new Error('Safety check stopped: dashboard A/B/C users are not distinct.');
  }
  return users;
}

async function validateDemoPair(users, trackedPendingId = null) {
  const block = await db.query(
    `SELECT count(*)::int AS count FROM public.beacon_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)`,
    [users.A, users.B]
  );
  if (Number(block.rows[0].count)) {
    throw new Error('Safety check stopped: A and B have an existing block; no demo pair changes were made.');
  }
  const pair = await db.query(
    `SELECT id, status FROM public.beacon_connections
      WHERE pair_key = least($1::uuid, $2::uuid)::text || ':' ||
                       greatest($1::uuid, $2::uuid)::text`,
    [users.A, users.B]
  );
  const nonAccepted = pair.rows.filter((row) => (
    row.status !== 'accepted'
    && row.status !== 'pending'
    && !(row.id === trackedPendingId && row.status === 'pending')
  ));
  if (nonAccepted.length) {
    throw new Error('Safety check stopped: A/B already have a non-accepted connection/request; it was not modified.');
  }
  const chat = await db.query(
    `SELECT id FROM public.conversations
      WHERE direct_pair_key = least($1::uuid, $2::uuid)::text || ':' ||
                             greatest($1::uuid, $2::uuid)::text`,
    [users.A, users.B]
  );
  if (chat.rowCount > 1) {
    throw new Error('Safety check stopped: multiple A/B direct conversations exist; none were modified.');
  }
  return {
    connectionId: pair.rows[0]?.id || null,
    connectionStatus: pair.rows[0]?.status || null,
    conversationId: chat.rows[0]?.id || null
  };
}

async function seed() {
  await db.connect();
  const users = await findUsers();
  let manifest;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (JSON.stringify(users) !== JSON.stringify(manifest.users)) {
      throw new Error('Tracked demo seed user identities changed; inspect before continuing or cleaning it.');
    }
    const pair = await validateDemoPair(
      users,
      manifest.connectionCreated ? manifest.connectionId : null
    );
    if ((manifest.connectionId && pair.connectionId !== manifest.connectionId)
        || (manifest.conversationId && pair.conversationId !== manifest.conversationId)) {
      throw new Error('Tracked demo seed no longer matches database state; inspect before changing or cleaning it.');
    }
    if (manifest.connectionId && manifest.conversationId && pair.connectionStatus === 'accepted') {
      console.log('DEMO SEED ALREADY PRESENT: verified tracked profiles, accepted circle connection, and direct chat; no changes made.');
      console.log('The existing alert demo seed remains available through npm run seed:alert.');
      return;
    }
  } else {
    const existingPair = await validateDemoPair(users);
    manifest = {
      users,
      createdProfiles: [],
      connectionId: existingPair.connectionId,
      connectionCreated: false,
      conversationId: existingPair.conversationId,
      conversationCreated: false,
      rateLimitEventIds: []
    };
    saveManifest(manifest);
  }

  const profileRows = await db.query(
    'SELECT id, full_name FROM public.resident_profiles WHERE id = ANY($1::uuid[])',
    [Object.values(users)]
  );
  const existingProfiles = new Map(profileRows.rows.map((row) => [row.id, row.full_name]));

  for (const label of labels) {
    const userId = users[label];
    if (existingProfiles.has(userId)) {
      console.log(`PROFILE ${label}: preserved existing profile; name was not changed.`);
      continue;
    }
    await db.query(
      `INSERT INTO public.resident_profiles
         (id, full_name, email, phone, address, privacy_consent_at)
       VALUES ($1, $2, $3, '', '', now())`,
      [userId, displayNames[label], accounts[label].email]
    );
    manifest.createdProfiles.push(userId);
    saveManifest(manifest);
    console.log(`PROFILE ${label}: created demo display name ${displayNames[label]}.`);
  }

  const a = await signIn('A');
  const b = await signIn('B');
  if (a.id !== users.A || b.id !== users.B) {
    throw new Error('Safety check stopped: signed-in dashboard identities did not match the dev database.');
  }

  const existingPending = await db.query(
    `SELECT id, status FROM public.beacon_connections
      WHERE pair_key = least($1::uuid, $2::uuid)::text || ':' ||
                       greatest($1::uuid, $2::uuid)::text
      AND status = 'pending'`,
    [users.A, users.B]
  );

  if (existingPending.rowCount && !manifest.connectionCreated) {
    manifest.connectionId = existingPending.rows[0].id;
    manifest.connectionCreated = true;
    saveManifest(manifest);
    console.log('A/B already have a pending circle request; accepting it to resume the demo seed.');
    await rpc(b.token, 'respond_circle_request', {
      p_request_id: manifest.connectionId,
      p_accept: true
    });
  }

  if (!manifest.connectionId) {
    const baseline = await db.query(
      'SELECT coalesce(max(id), 0)::bigint AS id FROM public.beacon_rate_limit_events WHERE user_id = $1',
      [users.A]
    );
    manifest.rateLimitBaseline = baseline.rows[0].id;
    saveManifest(manifest);
    const request = await rpc(a.token, 'send_circle_request', { p_target_id: users.B });
    manifest.connectionId = typeof request === 'string' ? request : request?.id;
    if (!manifest.connectionId) throw new Error('Circle request RPC did not return a connection id.');
    manifest.connectionCreated = true;
    saveManifest(manifest);

    const requestState = await db.query(
      'SELECT status FROM public.beacon_connections WHERE id = $1',
      [manifest.connectionId]
    );
    if (requestState.rows[0]?.status !== 'pending') {
      throw new Error('Circle request did not persist as pending; refusing to change its state.');
    }
    await rpc(b.token, 'respond_circle_request', {
      p_request_id: manifest.connectionId,
      p_accept: true
    });
    const rateRows = await db.query(
      `SELECT id FROM public.beacon_rate_limit_events
        WHERE user_id = $1 AND id > $2 AND action = 'request'`,
      [users.A, baseline.rows[0].id]
    );
    manifest.rateLimitEventIds = rateRows.rows.map((row) => row.id);
    saveManifest(manifest);
  } else if (manifest.connectionCreated) {
    const requestState = await db.query(
      'SELECT status FROM public.beacon_connections WHERE id = $1',
      [manifest.connectionId]
    );
    if (requestState.rows[0]?.status === 'pending') {
      await rpc(b.token, 'respond_circle_request', {
        p_request_id: manifest.connectionId,
        p_accept: true
      });
    }
    if (!(manifest.rateLimitEventIds || []).length && manifest.rateLimitBaseline !== undefined) {
      const rateRows = await db.query(
        `SELECT id FROM public.beacon_rate_limit_events
          WHERE user_id = $1 AND id > $2 AND action = 'request'`,
        [users.A, manifest.rateLimitBaseline]
      );
      manifest.rateLimitEventIds = rateRows.rows.map((row) => row.id);
      saveManifest(manifest);
    }
  }

  if (!manifest.conversationId) {
    const conversation = await rpc(a.token, 'create_direct_conversation', {
      p_other_user_id: users.B
    });
    manifest.conversationId = typeof conversation === 'string' ? conversation : conversation?.id;
    if (!manifest.conversationId) throw new Error('Direct conversation RPC did not return a conversation id.');
    manifest.conversationCreated = true;
    saveManifest(manifest);
  }

  const verified = await validateDemoPair(users);
  if (verified.connectionId !== manifest.connectionId
      || verified.conversationId !== manifest.conversationId) {
    throw new Error('Demo seed verification did not match the tracked connection and chat.');
  }
  console.log('DEMO SEED READY: A/B accepted circle connection and direct chat verified; C profile is available.');
  console.log('Profiles or pair/chat records that existed before this run were preserved.');
  console.log('The existing alert demo seed remains available through npm run seed:alert.');
  console.log('Clean up only rows created by this seed with npm run seed:demo:cleanup.');
}

async function cleanup() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error('No tracked demo seed exists; refusing to delete untracked rows.');
  }
  await db.connect();
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.conversationCreated && manifest.conversationId) {
    const current = await db.query(
      'SELECT id FROM public.conversations WHERE id = $1',
      [manifest.conversationId]
    );
    if (current.rowCount) {
      const messages = await db.query(
        'SELECT count(*)::int AS count FROM public.messages WHERE conversation_id = $1',
        [manifest.conversationId]
      );
      if (Number(messages.rows[0].count)) {
        throw new Error('Created demo conversation now contains messages; refusing to delete user-created chat data.');
      }
      await db.query('DELETE FROM public.conversation_members WHERE conversation_id = $1', [manifest.conversationId]);
      await db.query('DELETE FROM public.conversations WHERE id = $1', [manifest.conversationId]);
    }
  }
  if (manifest.connectionCreated && manifest.connectionId) {
    await db.query('DELETE FROM public.beacon_connections WHERE id = $1', [manifest.connectionId]);
  }
  if (manifest.rateLimitEventIds?.length) {
    await db.query(
      'DELETE FROM public.beacon_rate_limit_events WHERE id = ANY($1::bigint[])',
      [manifest.rateLimitEventIds]
    );
  }
  if (manifest.createdProfiles?.length) {
    await db.query(
      'DELETE FROM public.resident_profiles WHERE id = ANY($1::uuid[])',
      [manifest.createdProfiles]
    );
  }
  const counts = await db.query(
    `SELECT
       (SELECT count(*)::int FROM public.beacon_connections WHERE id = $1) AS created_connection,
       (SELECT count(*)::int FROM public.conversations WHERE id = $2) AS created_conversation,
       (SELECT count(*)::int FROM public.resident_profiles WHERE id = ANY($3::uuid[])) AS created_profiles,
       (SELECT count(*)::int FROM public.beacon_rate_limit_events WHERE id = ANY($4::bigint[])) AS rate_limit_events`,
    [
      manifest.connectionCreated ? manifest.connectionId : null,
      manifest.conversationCreated ? manifest.conversationId : null,
      manifest.createdProfiles || [],
      manifest.rateLimitEventIds || []
    ]
  );
  const remaining = counts.rows[0];
  console.log(`DEMO CLEANUP VERIFIED: ${Object.entries(remaining).map(([key, value]) => `${key}=${value}`).join(', ')}.`);
  if (Object.values(remaining).some((value) => Number(value))) {
    throw new Error('Cleanup verification found rows created by the demo seed.');
  }
  fs.rmSync(manifestPath);
}

try {
  if (process.argv.includes('--cleanup')) await cleanup();
  else await seed();
} catch (error) {
  console.error(`DEMO SEED ERROR: ${safeError(error, config)}`);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
