import fs from 'node:fs';
import path from 'node:path';
import {
  createDatabaseClient,
  assertDevelopmentEnvironment,
  loadDevConfig,
  repoRoot,
  safeError
} from './dev-supabase-test-helpers.js';
import { clearSession, setSession } from '../packages/supabase-client/src/auth.js';
import { configureSupabaseClient } from '../packages/supabase-client/src/client.js';
import { sendAlert } from '../apps/resident-pwa/src/features/messaging/messaging.client.js';

const config = loadDevConfig();
assertDevelopmentEnvironment(config.env);
const labels = ['A', 'B'];
const accounts = Object.fromEntries(labels.map((label) => [label, {
  email: config.env.get(`TEST_USER_${label}_EMAIL`),
  password: config.env.get('TEST_USER_PASSWORD')
}]));
if (Object.values(accounts).some(({ email, password }) => !email || !password)) {
  throw new Error('.env.test is missing test-account credentials.');
}

const manifestDir = path.join(repoRoot, '.artifacts', 'alerts-demo');
const manifestPath = path.join(manifestDir, 'seed-manifest.json');
const db = createDatabaseClient(config.databaseUrl);
configureSupabaseClient({ url: config.supabaseUrl, anonKey: config.anonKey });

function saveManifest(manifest) {
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function apiRequest(token, endpoint, body) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Dev Supabase request failed (${response.status}): ${payload?.message || 'unknown error'}`);
  }
  return payload;
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
    throw new Error(`Dev account ${label} sign-in failed (${response.status}).`);
  }
  return {
    id: payload.user.id,
    token: payload.access_token,
    refreshToken: payload.refresh_token
  };
}

async function cleanup(manifest) {
  const conversationIds = manifest.conversationCreated && manifest.conversationId
    ? [manifest.conversationId]
    : [];
  if (manifest.messageId) {
    await db.query('DELETE FROM public.messages WHERE id = $1', [manifest.messageId]);
  } else if (manifest.demoBody && manifest.conversationId) {
    await db.query(
      'DELETE FROM public.messages WHERE conversation_id = $1 AND sender_id = $2 AND type = $3 AND body = $4',
      [manifest.conversationId, manifest.users[0], 'alert', manifest.demoBody]
    );
  }
  if (conversationIds.length) {
    await db.query('DELETE FROM public.messages WHERE conversation_id = ANY($1::uuid[])', [conversationIds]);
    await db.query('DELETE FROM public.conversation_members WHERE conversation_id = ANY($1::uuid[])', [conversationIds]);
    await db.query('DELETE FROM public.conversations WHERE id = ANY($1::uuid[])', [conversationIds]);
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

  const remaining = await db.query(
    `SELECT
       (SELECT count(*)::int FROM public.messages WHERE id = $1) AS demo_message,
       (SELECT count(*)::int FROM public.conversations WHERE id = ANY($2::uuid[])) AS created_conversations,
       (SELECT count(*)::int FROM public.beacon_connections WHERE id = $3) AS created_connection,
       (SELECT count(*)::int FROM public.resident_profiles WHERE id = ANY($4::uuid[])) AS created_profiles,
       (SELECT count(*)::int FROM public.beacon_rate_limit_events WHERE id = ANY($5::bigint[])) AS rate_limit_events`,
    [
      manifest.messageId,
      conversationIds,
      manifest.connectionCreated ? manifest.connectionId : null,
      manifest.createdProfiles || [],
      manifest.rateLimitEventIds || []
    ]
  );
  const counts = remaining.rows[0];
  console.log(`ALERT DEMO CLEANUP VERIFIED: ${Object.entries(counts)
    .map(([name, count]) => `${name}=${count}`).join(', ')}.`);
  if (Object.values(counts).some((count) => Number(count))) {
    throw new Error('Cleanup verification found rows created by the alert demo seed.');
  }
  fs.rmSync(manifestPath);
}

async function seed() {
  if (fs.existsSync(manifestPath)) {
    throw new Error('An alert demo seed is already tracked; run the cleanup command first.');
  }
  await db.connect();
  const authRows = await db.query(
    'SELECT id, lower(email) AS email_key FROM auth.users WHERE lower(email) = ANY($1::text[])',
    [[accounts.A.email.toLowerCase(), accounts.B.email.toLowerCase()]]
  );
  if (authRows.rowCount !== 2) throw new Error('Safety check stopped: expected two existing test accounts.');
  const usersByEmail = new Map(authRows.rows.map((row) => [row.email_key, row.id]));
  const userA = usersByEmail.get(accounts.A.email.toLowerCase());
  const userB = usersByEmail.get(accounts.B.email.toLowerCase());
  if (!userA || !userB || userA === userB) throw new Error('Safety check stopped: test accounts are not distinct.');

  const pair = await db.query(
    `SELECT c.id, c.status
       FROM public.beacon_connections c
      WHERE c.pair_key = least($1::uuid, $2::uuid)::text || ':' ||
                         greatest($1::uuid, $2::uuid)::text`,
    [userA, userB]
  );
  const blocks = await db.query(
    `SELECT count(*)::int AS count FROM public.beacon_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)`,
    [userA, userB]
  );
  if (Number(blocks.rows[0].count)
      || pair.rows.some((row) => row.status !== 'accepted')) {
    throw new Error('Safety check stopped: A/B have a block or non-accepted connection/request.');
  }
  const existingConversation = await db.query(
    `SELECT id FROM public.conversations c
      WHERE c.kind = 'direct'
        AND EXISTS (SELECT 1 FROM public.conversation_members ma
                     WHERE ma.conversation_id = c.id AND ma.user_id = $1)
        AND EXISTS (SELECT 1 FROM public.conversation_members mb
                     WHERE mb.conversation_id = c.id AND mb.user_id = $2)
      LIMIT 1`,
    [userA, userB]
  );
  if (existingConversation.rowCount && !pair.rows.some((row) => row.status === 'accepted')) {
    throw new Error('Safety check stopped: an existing direct chat has no accepted connection.');
  }
  const profiles = await db.query(
    'SELECT id FROM public.resident_profiles WHERE id = ANY($1::uuid[])',
    [[userA, userB]]
  );
  const profileIds = new Set(profiles.rows.map((row) => row.id));
  const manifest = {
    users: [userA, userB],
    createdProfiles: [],
    connectionId: pair.rows.find((row) => row.status === 'accepted')?.id || null,
    connectionCreated: false,
    conversationId: null,
    conversationCreated: false,
    messageId: null,
    rateLimitEventIds: []
  };
  saveManifest(manifest);
  for (const [label, userId] of [['A', userA], ['B', userB]]) {
    if (profileIds.has(userId)) continue;
    await db.query(
      `INSERT INTO public.resident_profiles
         (id, full_name, email, phone, address, privacy_consent_at)
       VALUES ($1, $2, $3, '', '', now())`,
      [userId, `CivicNeuro Demo ${label}`, accounts[label].email]
    );
    manifest.createdProfiles.push(userId);
    saveManifest(manifest);
  }

  if (existingConversation.rowCount) {
    manifest.conversationId = existingConversation.rows[0].id;
  }

  const a = await signIn('A');
  const b = await signIn('B');
  if (a.id !== userA || b.id !== userB) throw new Error('Safety check stopped: signed-in IDs do not match database users.');
  setSession(a.token, { id: a.id }, a.refreshToken);
  if (!manifest.connectionId) {
    const limits = await db.query(
      `SELECT cfg.requests_per_hour,
              count(events.id)::int AS requests_used
         FROM public.beacon_rate_limit_config cfg
         LEFT JOIN public.beacon_rate_limit_events events
           ON events.user_id = $1 AND events.action = 'request'
          AND events.created_at >= now() - interval '1 hour'
        GROUP BY cfg.requests_per_hour`,
      [userA]
    );
    if (!limits.rowCount
        || Number(limits.rows[0].requests_used) >= Number(limits.rows[0].requests_per_hour)) {
      throw new Error('Safety check stopped: A lacks circle-request capacity.');
    }
    const baseline = await db.query(
      'SELECT coalesce(max(id), 0)::bigint AS id FROM public.beacon_rate_limit_events WHERE user_id = $1',
      [userA]
    );
    const requestId = await apiRequest(a.token, 'rpc/send_circle_request', { p_target_id: userB });
    manifest.connectionId = Array.isArray(requestId) ? requestId[0] : requestId;
    manifest.connectionCreated = true;
    saveManifest(manifest);
    const rateRows = await db.query(
      `SELECT id FROM public.beacon_rate_limit_events
        WHERE user_id = $1 AND id > $2 AND action = 'request'`,
      [userA, baseline.rows[0].id]
    );
    manifest.rateLimitEventIds = rateRows.rows.map((row) => row.id);
    saveManifest(manifest);
    await apiRequest(b.token, 'rpc/respond_circle_request', {
      p_request_id: manifest.connectionId,
      p_accept: true
    });
  }

  if (!manifest.conversationId) {
    const before = await db.query(
      `SELECT id FROM public.conversations
        WHERE direct_pair_key = least($1::uuid, $2::uuid)::text || ':' ||
                               greatest($1::uuid, $2::uuid)::text`,
      [userA, userB]
    );
    const result = await apiRequest(a.token, 'rpc/create_direct_conversation', {
      p_other_user_id: userB
    });
    manifest.conversationId = Array.isArray(result) ? result[0] : result;
    manifest.conversationCreated = before.rowCount === 0;
    saveManifest(manifest);
  }

  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  manifest.demoBody = `CivicNeuro demo safety alert ${runId}`;
  saveManifest(manifest);
  const inserted = await sendAlert(manifest.conversationId, manifest.demoBody);
  if (!inserted?.id) throw new Error('Supabase did not return the saved demo alert row.');
  manifest.messageId = inserted.id;
  saveManifest(manifest);
  console.log('DEMO ALERT SEEDED: test account A sent one alert to the existing Alerts feed for test account B.');
  console.log(`Cleanup with: npm run seed:alert:cleanup`);
}

try {
  if (process.argv.includes('--cleanup')) {
    if (!fs.existsSync(manifestPath)) throw new Error('No tracked alert demo seed exists to clean up.');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    await db.connect();
    await cleanup(manifest);
  } else {
    await seed();
  }
} catch (error) {
  console.error(`ALERT DEMO ERROR: ${safeError(error, config)}`);
  process.exitCode = 1;
} finally {
  clearSession();
  await db.end().catch(() => {});
}
