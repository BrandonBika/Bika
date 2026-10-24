import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  createDatabaseClient,
  loadDevConfig,
  repoRoot,
  safeError
} from './dev-supabase-test-helpers.js';

const config = loadDevConfig();
const accounts = {
  A: { email: config.env.get('TEST_USER_A_EMAIL'), password: config.env.get('TEST_USER_PASSWORD') },
  B: { email: config.env.get('TEST_USER_B_EMAIL'), password: config.env.get('TEST_USER_PASSWORD') }
};
if (Object.values(accounts).some(({ email, password }) => !email || !password)) {
  throw new Error('.env.test is missing A/B Alerts browser test credentials.');
}

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const names = { A: `Alerts Browser A ${runId}`, B: `Alerts Browser B ${runId}` };
const alertBody = `Browser safety alert ${runId}`;
const screenshotDir = path.join(repoRoot, '.artifacts', 'alerts-e2e', `browser-${runId}`);
fs.mkdirSync(screenshotDir, { recursive: true });

const users = {};
const createdProfileIds = [];
const rateLimitEventIds = new Set();
const realtimeFrames = [];
let db;
let dbConnected = false;
let preflightPassed = false;
let requestId = null;
let conversationId = null;
let rateLimitBaseline = 0;
let browser;
let contextA;
let contextB;
let pageA;
let pageB;

function redact(value) {
  let text = String(value);
  for (const secret of [
    config.anonKey,
    config.databaseUrl,
    accounts.A.email,
    accounts.B.email,
    accounts.A.password
  ]) {
    if (secret) text = text.replaceAll(secret, '[REDACTED]');
  }
  return text
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[JWT]')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s"']+/gi, '[REDACTED DATABASE URL]');
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true;
    await pause(100);
  }
  return Boolean(await predicate());
}

async function preflight() {
  const authRows = await db.query(
    'SELECT id, lower(email) AS email_key FROM auth.users WHERE lower(email) = ANY($1::text[])',
    [[accounts.A.email.toLowerCase(), accounts.B.email.toLowerCase()]]
  );
  if (authRows.rowCount !== 2) {
    throw new Error('Safety preflight stopped: expected exactly two existing A/B auth users.');
  }
  const byEmail = new Map(authRows.rows.map((row) => [row.email_key, row.id]));
  users.A = byEmail.get(accounts.A.email.toLowerCase());
  users.B = byEmail.get(accounts.B.email.toLowerCase());
  if (!users.A || !users.B || users.A === users.B) {
    throw new Error('Safety preflight stopped: A/B users are not distinct.');
  }

  const pair = await db.query(
    `SELECT
       (SELECT count(*)::int FROM public.beacon_connections
         WHERE pair_key = least($1::uuid, $2::uuid)::text || ':' ||
                          greatest($1::uuid, $2::uuid)::text) AS connections,
       (SELECT count(*)::int FROM public.beacon_blocks
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)) AS blocks,
       (SELECT count(*)::int FROM public.conversations c
         WHERE c.kind = 'direct'
           AND EXISTS (SELECT 1 FROM public.conversation_members ma
                        WHERE ma.conversation_id = c.id AND ma.user_id = $1)
           AND EXISTS (SELECT 1 FROM public.conversation_members mb
                        WHERE mb.conversation_id = c.id AND mb.user_id = $2)) AS direct_chats`,
    [users.A, users.B]
  );
  const pairCounts = pair.rows[0];
  if (Object.values(pairCounts).some(Number)) {
    throw new Error(
      `Safety preflight stopped: existing connections/requests=${pairCounts.connections}, `
      + `blocks=${pairCounts.blocks}, direct chats=${pairCounts.direct_chats}.`
    );
  }
  const profiles = await db.query(
    'SELECT id FROM public.resident_profiles WHERE id = ANY($1::uuid[])',
    [[users.A, users.B]]
  );
  if (profiles.rowCount) {
    throw new Error('Safety preflight stopped: A/B already have resident profile rows.');
  }
  const limits = await db.query(
    `SELECT cfg.requests_per_hour, cfg.searches_per_hour,
            count(*) FILTER (WHERE events.action = 'request')::int AS requests_used,
            count(*) FILTER (WHERE events.action = 'search')::int AS searches_used
       FROM public.beacon_rate_limit_config AS cfg
       LEFT JOIN public.beacon_rate_limit_events AS events
         ON events.user_id = $1 AND events.created_at >= now() - interval '1 hour'
      GROUP BY cfg.requests_per_hour, cfg.searches_per_hour`,
    [users.A]
  );
  if (!limits.rowCount
      || Number(limits.rows[0].requests_used) >= Number(limits.rows[0].requests_per_hour)
      || Number(limits.rows[0].searches_used) >= Number(limits.rows[0].searches_per_hour)) {
    throw new Error('Safety preflight stopped: A lacks Beacon request or search capacity.');
  }
  const baseline = await db.query(
    `SELECT coalesce(max(id), 0)::bigint AS id
       FROM public.beacon_rate_limit_events
      WHERE user_id = $1 AND action IN ('request', 'search')`,
    [users.A]
  );
  rateLimitBaseline = Number(baseline.rows[0].id);
  const nameCollision = await db.query(
    `SELECT count(*)::int AS count FROM public.resident_profiles
      WHERE lower(btrim(full_name)) = ANY($1::text[])`,
    [[names.A.toLowerCase(), names.B.toLowerCase()]]
  );
  if (Number(nameCollision.rows[0].count)) {
    throw new Error('Safety preflight stopped: generated temporary profile names are not unique.');
  }
  console.log('SAFE TARGET CHECK: PASS (.env.test dev target); distinct users, clean pair, and temporary names verified.');
}

async function createTemporaryProfiles() {
  for (const label of ['A', 'B']) {
    const inserted = await db.query(
      `INSERT INTO public.resident_profiles
         (id, full_name, email, phone, address, privacy_consent_at)
       VALUES ($1, $2, $3, '', '', now())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [users[label], names[label], accounts[label].email]
    );
    if (inserted.rowCount !== 1) {
      throw new Error('Temporary profile setup stopped: profile was not newly created.');
    }
    createdProfileIds.push(users[label]);
  }
}

function runtimeOverride() {
  const file = path.join(repoRoot, 'apps', 'resident-pwa', 'runtime-config.js');
  return fs.readFileSync(file, 'utf8')
    .replace('beaconEnabled: false', 'beaconEnabled: true')
    .replace(/supabaseUrl:\s*'[^']*'/, `supabaseUrl: ${JSON.stringify(config.supabaseUrl)}`)
    .replace(/supabaseAnonKey:\s*'[^']*'/, `supabaseAnonKey: ${JSON.stringify(config.anonKey)}`);
}

async function trackRateLimitRows() {
  const rows = await db.query(
    `SELECT id FROM public.beacon_rate_limit_events
      WHERE user_id = $1 AND id > $2 AND action IN ('request', 'search')`,
    [users.A, rateLimitBaseline]
  );
  for (const row of rows.rows) rateLimitEventIds.add(Number(row.id));
}

async function createContext(runtime) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  await context.route('https://**.supabase.co/**', (route) => (
    new URL(route.request().url()).origin === config.supabaseUrl ? route.continue() : route.abort()
  ));
  await context.route('**/runtime-config.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: runtime
  }));
  return context;
}

async function login(page, label) {
  await page.goto('http://127.0.0.1:3000/#sign-in', { waitUntil: 'domcontentloaded' });
  await page.locator('cn-input[type="email"] input').fill(accounts[label].email);
  await page.locator('cn-input[type="password"] input').fill(accounts[label].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/#home(?:$|\?)/, { timeout: 20000 });
}

async function attachRealtime(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const capture = (event, direction) => {
    try {
      const frame = JSON.parse(event.response.payloadData);
      if (Array.isArray(frame)) realtimeFrames.push({ direction, frame });
    } catch {
      // Ignore non-JSON websocket frames.
    }
  };
  cdp.on('Network.webSocketFrameSent', (event) => capture(event, 'sent'));
  cdp.on('Network.webSocketFrameReceived', (event) => capture(event, 'received'));
  return cdp;
}

async function cleanupAndVerify() {
  const rows = await db.query(
    `SELECT c.id FROM public.conversations c
      WHERE c.kind = 'direct'
        AND EXISTS (SELECT 1 FROM public.conversation_members ma
                     WHERE ma.conversation_id = c.id AND ma.user_id = $1)
        AND EXISTS (SELECT 1 FROM public.conversation_members mb
                     WHERE mb.conversation_id = c.id AND mb.user_id = $2)`,
    [users.A, users.B]
  );
  const conversationIds = new Set(rows.rows.map((row) => row.id));
  if (conversationId) conversationIds.add(conversationId);
  const tracked = [...conversationIds];
  if (tracked.length) {
    await db.query('DELETE FROM public.messages WHERE conversation_id = ANY($1::uuid[])', [tracked]);
    await db.query('DELETE FROM public.conversation_members WHERE conversation_id = ANY($1::uuid[])', [tracked]);
    await db.query('DELETE FROM public.conversations WHERE id = ANY($1::uuid[])', [tracked]);
  }
  if (requestId) await db.query('DELETE FROM public.beacon_connections WHERE id = $1', [requestId]);
  await trackRateLimitRows();
  const trackedRateIds = [...rateLimitEventIds];
  if (trackedRateIds.length) {
    await db.query('DELETE FROM public.beacon_rate_limit_events WHERE id = ANY($1::bigint[])', [trackedRateIds]);
  }
  if (createdProfileIds.length) {
    await db.query('DELETE FROM public.resident_profiles WHERE id = ANY($1::uuid[])', [createdProfileIds]);
  }

  const remaining = await db.query(
    `SELECT
       (SELECT count(*)::int FROM public.beacon_connections
         WHERE pair_key = least($1::uuid, $2::uuid)::text || ':' ||
                          greatest($1::uuid, $2::uuid)::text) AS connections,
       (SELECT count(*)::int FROM public.conversations c
         WHERE c.kind = 'direct'
           AND EXISTS (SELECT 1 FROM public.conversation_members ma
                        WHERE ma.conversation_id = c.id AND ma.user_id = $1)
           AND EXISTS (SELECT 1 FROM public.conversation_members mb
                        WHERE mb.conversation_id = c.id AND mb.user_id = $2)) AS direct_chats,
       (SELECT count(*)::int FROM public.messages WHERE conversation_id = ANY($3::uuid[])) AS messages,
       (SELECT count(*)::int FROM public.resident_profiles WHERE id = ANY($4::uuid[])) AS temporary_profiles,
       (SELECT count(*)::int FROM public.beacon_rate_limit_events WHERE id = ANY($5::bigint[])) AS rate_limit_events`,
    [users.A, users.B, tracked, createdProfileIds, trackedRateIds]
  );
  const counts = remaining.rows[0];
  console.log(`CLEANUP VERIFIED (separate query): ${Object.entries(counts)
    .map(([name, count]) => `${name}=${count}`).join(', ')}.`);
  if (Object.values(counts).some((count) => Number(count))) {
    throw new Error('Cleanup verification found remaining Alerts browser test rows.');
  }
}

try {
  db = createDatabaseClient(config.databaseUrl);
  await db.connect();
  dbConnected = true;
  await preflight();
  preflightPassed = true;
  await createTemporaryProfiles();

  browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const runtime = runtimeOverride();
  contextA = await createContext(runtime);
  contextB = await createContext(runtime);
  pageA = await contextA.newPage();
  pageB = await contextB.newPage();
  await Promise.all([login(pageA, 'A'), login(pageB, 'B')]);
  const cdpB = await attachRealtime(pageB);

  await pageB.goto('http://127.0.0.1:3000/#beacon-requests', { waitUntil: 'domcontentloaded' });
  await pageB.getByText('Circle requests', { exact: true }).waitFor({ timeout: 15000 });
  await pageA.goto('http://127.0.0.1:3000/#beacon-add-to-circle', { waitUntil: 'domcontentloaded' });
  await pageA.locator('#add-search-input').waitFor({ timeout: 15000 });
  await pageA.locator('#add-search-input').fill(names.B);
  const result = pageA.locator('#add-results-section .bc-request-row')
    .filter({ has: pageA.locator('.bc-name').getByText(names.B, { exact: true }) });
  if (!await waitFor(() => result.count().then((count) => count === 1))) {
    throw new Error('A did not find the unique temporary B resident.');
  }
  await result.getByRole('button', { name: 'Request', exact: true }).click();
  const requested = await waitFor(async () => {
    const rows = await db.query(
      `SELECT id, status FROM public.beacon_connections
        WHERE pair_key = least($1::uuid, $2::uuid)::text || ':' ||
                         greatest($1::uuid, $2::uuid)::text`,
      [users.A, users.B]
    );
    if (!rows.rowCount) return false;
    requestId = rows.rows[0].id;
    return rows.rows[0].status === 'pending';
  }, 12000);
  if (!requested) throw new Error('A circle request did not persist.');

  await pageB.getByText(names.A, { exact: true }).waitFor({ timeout: 10000 });
  await pageB.getByRole('button', { name: 'Accept', exact: true }).click();
  const accepted = await waitFor(async () => {
    const rows = await db.query('SELECT status FROM public.beacon_connections WHERE id = $1', [requestId]);
    return rows.rowCount === 1 && rows.rows[0].status === 'accepted';
  }, 12000);
  if (!accepted) throw new Error('B circle acceptance did not persist.');

  await pageA.goto('http://127.0.0.1:3000/#beacon-home', { waitUntil: 'domcontentloaded' });
  await pageA.locator('#bc-tab-circle').waitFor({ timeout: 12000 });
  await pageA.locator('#bc-tab-circle').click();
  await pageA.getByRole('button', { name: `Message ${names.B}`, exact: true }).click();
  await pageA.locator('#chat-text-input').waitFor({ timeout: 15000 });
  const conversations = await db.query(
    `SELECT c.id FROM public.conversations c
      WHERE c.kind = 'direct'
        AND EXISTS (SELECT 1 FROM public.conversation_members ma
                     WHERE ma.conversation_id = c.id AND ma.user_id = $1)
        AND EXISTS (SELECT 1 FROM public.conversation_members mb
                     WHERE mb.conversation_id = c.id AND mb.user_id = $2)`,
    [users.A, users.B]
  );
  if (conversations.rowCount !== 1) throw new Error('Expected one temporary direct conversation.');
  conversationId = conversations.rows[0].id;

  await pageB.goto('http://127.0.0.1:3000/#notifications', { waitUntil: 'domcontentloaded' });
  await pageB.getByRole('heading', { name: 'Notifications', exact: true }).waitFor({ timeout: 15000 });
  const alertRealtimeTopic = `realtime:conversation:${conversationId}`;
  const joinSent = await waitFor(() => realtimeFrames.some(({ direction, frame }) => (
    direction === 'sent' && frame[2] === alertRealtimeTopic && frame[3] === 'phx_join'
  )), 12000);
  const joinAck = await waitFor(() => realtimeFrames.some(({ direction, frame }) => (
    direction === 'received'
      && frame[2] === alertRealtimeTopic
      && frame[3] === 'phx_reply'
      && frame[4]?.status === 'ok'
  )), 8000);
  const joined = joinSent && joinAck;
  console.log(`ALERTS REALTIME JOIN: sent=${joinSent ? 'yes' : 'no'}, ok acknowledgement=${joinAck ? 'yes' : 'no'}.`);
  if (!joined) {
    const receivedEvents = realtimeFrames.map(({ direction, frame }) => (
      `${direction}:${frame[2]}:${frame[3]}`
    )).slice(-12);
    console.log(`ALERTS RECEIVED CHANNEL EVENTS: ${receivedEvents.join(', ') || 'none'}.`);
  }
  await pageB.screenshot({ path: path.join(screenshotDir, 'b-alerts-before-send.png'), fullPage: true });

  await pageA.evaluate(async ({ id, body }) => {
    const { sendAlert } = await import('/apps/resident-pwa/src/features/messaging/messaging.client.js');
    await sendAlert(id, body);
  }, { id: conversationId, body: alertBody });
  const alertVisible = await waitFor(() => pageB.getByText(alertBody, { exact: true })
    .count().then((count) => count === 1), 12000);
  const matchingRealtime = realtimeFrames.some(({ direction, frame }) => (
    direction === 'received'
      && frame[2] === alertRealtimeTopic
      && frame[3] === 'postgres_changes'
      && JSON.stringify(frame[4] || {}).includes(alertBody)
  ));
  await pageA.screenshot({ path: path.join(screenshotDir, 'a-alert-sent.png'), fullPage: true });
  await pageB.screenshot({ path: path.join(screenshotDir, 'b-alert-visible.png'), fullPage: true });
  if (!alertVisible) {
    const visibleText = (await pageB.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 500);
    throw new Error(
      `Alert was not visible on B's Notifications screen; join=${joined}, `
      + `Realtime frame=${matchingRealtime}; visible state: ${redact(visibleText)}`
    );
  }
  console.log(`ALERTS BROWSER PASS: A called the existing sendAlert API; B's existing Notifications screen displayed the alert live; matching Realtime change frame=${matchingRealtime ? 'yes' : 'no'}; conversation join=${joined ? 'yes' : 'no'}.`);
  console.log('Existing Alerts page has no send control; the test invokes the existing messaging client API for the sender.');
  await cdpB.detach().catch(() => {});
} catch (error) {
  console.error(`ALERTS BROWSER FAIL: ${safeError(error, config)}`);
  process.exitCode = 1;
} finally {
  await contextA?.close().catch(() => {});
  await contextB?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (dbConnected && preflightPassed) {
    try {
      await cleanupAndVerify();
    } catch (error) {
      console.error(`ALERTS CLEANUP FAIL: ${safeError(error, config)}`);
      process.exitCode = 1;
    }
  }
  if (dbConnected) await db.end().catch(() => {});
}
console.log(`ALERTS SCREENSHOTS: ${screenshotDir}`);
