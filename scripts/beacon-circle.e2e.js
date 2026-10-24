import {
  clearSession,
  configureSupabaseClient
} from '@civicneuro/supabase-client';
import * as auth from '../packages/supabase-client/src/auth.js';
import * as messaging from '../apps/resident-pwa/src/features/messaging/messaging.client.js';
import * as beacon from '../apps/resident-pwa/src/features/beacon/beacon-circle.client.js';
import {
  createDatabaseClient,
  loadDevConfig,
  safeError
} from './dev-supabase-test-helpers.js';

const WAIT_MS = 10000;
const config = loadDevConfig();
const labels = ['A', 'B', 'C'];
const credentials = labels.map((label) => ({
  label,
  email: config.env.get(`TEST_USER_${label}_EMAIL`),
  password: config.env.get('TEST_USER_PASSWORD')
}));
if (credentials.some(({ email, password }) => !email || !password)) {
  throw new Error('.env.test is missing one or more live-test account settings.');
}

const database = createDatabaseClient(config.databaseUrl);
const users = new Map();
const testRows = {
  createdProfiles: [],
  requestId: null,
  conversationId: null,
  blockCreated: false,
  rateLimitEventIds: []
};
const subscriptions = [];
const checks = [];
let baselineRequestEventId = 0;

function report(name, passed, evidence) {
  const status = passed ? 'PASS' : 'FAIL';
  checks.push({ name, passed });
  console.log(`${status} ${name}: ${evidence}`);
}

function waitFor(predicate, timeoutMs = WAIT_MS) {
  return new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      if (predicate()) {
        resolve(true);
      } else if (Date.now() - start >= timeoutMs) {
        resolve(false);
      } else {
        setTimeout(poll, 50);
      }
    };
    poll();
  });
}

async function setUser(label) {
  const user = users.get(label);
  if (!user) throw new Error(`Test user ${label} is not signed in.`);
  auth.setSession(user.accessToken, user, user.refreshToken);
}

async function ensureProfiles() {
  for (const label of labels) {
    const user = users.get(label);
    const existing = await database.query(
      'SELECT id FROM public.resident_profiles WHERE id = $1',
      [user.id]
    );
    if (existing.rowCount) continue;
    const inserted = await database.query(
      `INSERT INTO public.resident_profiles
         (id, full_name, email, phone, address, privacy_consent_at)
       VALUES ($1, $2, $3, '', '', now())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [user.id, `Beacon E2E Resident ${label}`, user.email]
    );
    if (inserted.rowCount) testRows.createdProfiles.push(user.id);
  }
}

async function ensureCleanPair() {
  const [a, b] = [users.get('A'), users.get('B')];
  const existingBlock = await database.query(
    `SELECT 1 FROM public.beacon_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)
      LIMIT 1`,
    [a.id, b.id]
  );
  if (existingBlock.rowCount) {
    throw new Error('A/B already have a block; refusing to modify pre-existing data.');
  }
  const existingConnection = await database.query(
    `SELECT id FROM public.beacon_connections
     WHERE pair_key = least($1::uuid, $2::uuid)::text || ':' ||
                      greatest($1::uuid, $2::uuid)::text`,
    [a.id, b.id]
  );
  if (existingConnection.rowCount) {
    throw new Error('A/B already have a Beacon connection/request; refusing to modify pre-existing data.');
  }
  const existingDirect = await database.query(
    `SELECT conversation_id
       FROM public.conversation_members
      WHERE user_id IN ($1, $2)
      GROUP BY conversation_id
     HAVING count(DISTINCT user_id) = 2`,
    [a.id, b.id]
  );
  if (existingDirect.rowCount) {
    const candidates = await database.query(
      `SELECT conversation_id
         FROM public.conversation_members AS a
         JOIN public.conversations AS c ON c.id = a.conversation_id
        WHERE a.user_id = $1 AND c.kind = 'direct'
          AND EXISTS (
            SELECT 1 FROM public.conversation_members AS b
             WHERE b.conversation_id = a.conversation_id AND b.user_id = $2
          )`,
      [a.id, b.id]
    );
    if (candidates.rowCount) {
      throw new Error('A/B already have a direct conversation; refusing to alter pre-existing data.');
    }
  }
  const priorEvents = await database.query(
    `SELECT coalesce(max(id), 0) AS id
       FROM public.beacon_rate_limit_events
      WHERE user_id = $1 AND action = 'request'`,
    [a.id]
  );
  baselineRequestEventId = Number(priorEvents.rows[0].id);
}

async function signInUsers() {
  configureSupabaseClient({ url: config.supabaseUrl, anonKey: config.anonKey });
  for (const account of credentials) {
    try {
      const session = await auth.signInWithPassword({
        email: account.email,
        password: account.password
      });
      users.set(account.label, {
        ...session.user,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        email: account.email
      });
      report(`Sign-in ${account.label}`, true, 'password auth succeeded; identity and token withheld.');
    } catch (error) {
      const category = error.code || error.status || 'auth_error';
      report(`Sign-in ${account.label}`, false, `server category ${category}; message: ${safeError(error, config)}`);
      throw new Error(`Sign-in ${account.label} failed.`);
    }
  }
}

async function runRealtimeScenario() {
  const a = users.get('A');
  const b = users.get('B');
  const receivedRequests = [];
  let bSubscriptionError = null;

  await setUser('B');
  const bSubscription = beacon.subscribeToRequests((change) => {
    receivedRequests.push(change);
  }, (error) => {
    bSubscriptionError = error;
  });
  subscriptions.push(bSubscription);
  await bSubscription.ready;
  report('B Realtime subscription active', true, 'subscription.ready resolved after SUBSCRIBED.');

  await setUser('A');
  const requestId = await beacon.sendRequest(b.id);
  testRows.requestId = requestId;
  const rateEvents = await database.query(
    `SELECT id FROM public.beacon_rate_limit_events
      WHERE user_id = $1 AND action = 'request' AND id > $2
      ORDER BY id`,
    [a.id, baselineRequestEventId]
  );
  testRows.rateLimitEventIds.push(...rateEvents.rows.map((row) => Number(row.id)));

  const requestDelivered = await waitFor(() => receivedRequests.some((change) => (
    change?.new?.id === requestId
    || change?.id === requestId
    || (change?.new?.requester_id === a.id && change?.new?.addressee_id === b.id)
  )));
  const persistedRequest = await database.query(
    'SELECT count(*)::int AS count FROM public.beacon_connections WHERE id = $1',
    [requestId]
  );
  const callbackError = bSubscriptionError
    ? (bSubscriptionError.code || bSubscriptionError.message || 'unknown')
    : 'none';
  report(
    'B receives A request through Realtime',
    requestDelivered && !bSubscriptionError,
    `${receivedRequests.length} change event(s) observed after SUBSCRIBED; request row count=${persistedRequest.rows[0].count}; callback error=${safeError({ message: String(callbackError) }, config)}.`
  );
  report(
    'A request is persisted',
    persistedRequest.rows[0].count === 1,
    `database row count=${persistedRequest.rows[0].count}.`
  );

  await setUser('B');
  await beacon.respondToRequest(requestId, true);
  await setUser('A');
  const conversationId = await messaging.createDirect(b.id);
  testRows.conversationId = conversationId;
  report('Accepted connection opens direct chat', Boolean(conversationId), 'createDirect returned a conversation id.');
  if (!conversationId) throw new Error('Direct conversation was not created.');

  await setUser('C');
  let outsiderRejected = false;
  try {
    await messaging.sendText(conversationId, 'outsider test message');
  } catch {
    outsiderRejected = true;
  }
  report('C cannot message A or B', outsiderRejected, 'outsider insert against A/B conversation was rejected.');
  if (!outsiderRejected) throw new Error('Outsider message was unexpectedly accepted.');

  await setUser('B');
  await beacon.block(a.id);
  testRows.blockCreated = true;
  await setUser('A');
  let blockedMessageRejected = false;
  try {
    await messaging.sendText(conversationId, 'blocked direct message test');
  } catch {
    blockedMessageRejected = true;
  }
  report('A message rejected after B blocks A', blockedMessageRejected, 'post-block message insert was rejected.');
  if (!blockedMessageRejected) throw new Error('Blocked message was unexpectedly accepted.');
}

async function cleanup() {
  for (const subscription of subscriptions) {
    try {
      subscription.unsubscribe();
    } catch {
      console.log('FAIL Realtime subscription cleanup: unsubscribe raised an error.');
    }
  }

  if (testRows.conversationId) {
    await database.query('DELETE FROM public.messages WHERE conversation_id = $1', [testRows.conversationId]);
    await database.query('DELETE FROM public.conversation_members WHERE conversation_id = $1', [testRows.conversationId]);
    await database.query('DELETE FROM public.conversations WHERE id = $1', [testRows.conversationId]);
  }
  if (testRows.requestId) {
    await database.query('DELETE FROM public.beacon_connections WHERE id = $1', [testRows.requestId]);
  }
  if (testRows.blockCreated) {
    await database.query(
      'DELETE FROM public.beacon_blocks WHERE blocker_id = $1 AND blocked_id = $2',
      [users.get('B').id, users.get('A').id]
    );
  }
  if (testRows.rateLimitEventIds.length) {
    await database.query(
      'DELETE FROM public.beacon_rate_limit_events WHERE id = ANY($1::bigint[])',
      [testRows.rateLimitEventIds]
    );
  }
  if (testRows.createdProfiles.length) {
    await database.query(
      'DELETE FROM public.resident_profiles WHERE id = ANY($1::uuid[])',
      [testRows.createdProfiles]
    );
  }
}

async function verifyNoTestRowsRemain() {
  const messageCount = await database.query(
    'SELECT count(*)::int AS count FROM public.messages WHERE conversation_id = $1',
    [testRows.conversationId || '00000000-0000-0000-0000-000000000000']
  );
  const conversationCount = await database.query(
    'SELECT count(*)::int AS count FROM public.conversations WHERE id = $1',
    [testRows.conversationId || '00000000-0000-0000-0000-000000000000']
  );
  const connectionCount = await database.query(
    'SELECT count(*)::int AS count FROM public.beacon_connections WHERE id = $1',
    [testRows.requestId || '00000000-0000-0000-0000-000000000000']
  );
  const blockCount = await database.query(
    'SELECT count(*)::int AS count FROM public.beacon_blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [users.get('B')?.id || '00000000-0000-0000-0000-000000000000', users.get('A')?.id || '00000000-0000-0000-0000-000000000000']
  );
  const profileCount = testRows.createdProfiles.length
    ? await database.query(
      'SELECT count(*)::int AS count FROM public.resident_profiles WHERE id = ANY($1::uuid[])',
      [testRows.createdProfiles]
    )
    : { rows: [{ count: 0 }] };
  const rateLimitCount = testRows.rateLimitEventIds.length
    ? await database.query(
      'SELECT count(*)::int AS count FROM public.beacon_rate_limit_events WHERE id = ANY($1::bigint[])',
      [testRows.rateLimitEventIds]
    )
    : { rows: [{ count: 0 }] };
  const counts = [
    messageCount.rows[0].count,
    conversationCount.rows[0].count,
    connectionCount.rows[0].count,
    blockCount.rows[0].count,
    profileCount.rows[0].count,
    rateLimitCount.rows[0].count
  ];
  const names = ['messages', 'conversations', 'connections', 'blocks', 'test-created profiles', 'rate-limit events'];
  const remains = counts.some((count) => count !== 0);
  report('Cleanup leaves zero test rows', !remains, names.map((name, index) => `${name}=${counts[index]}`).join(', '));
}

try {
  console.log('SAFE TARGET CHECK PASS: dev .env.test target differs from linked/runtime project references.');
  await database.connect();
  await signInUsers();
  await ensureProfiles();
  await ensureCleanPair();
  await runRealtimeScenario();
} catch (error) {
  console.log(`E2E stopped safely: ${safeError(error, config)}`);
} finally {
  try {
    if (database._connected) {
      await cleanup();
      await verifyNoTestRowsRemain();
    }
  } catch (error) {
    report('Cleanup leaves zero test rows', false, safeError(error, config));
  }
  await database.end().catch(() => {});
  clearSession();
}

const failed = checks.filter((check) => !check.passed);
console.log(`LIVE BEACON SUMMARY: ${checks.filter((check) => check.passed).length} PASS, ${failed.length} FAIL, ${checks.length} checked.`);
if (failed.length || checks.length < 6) process.exitCode = 1;
