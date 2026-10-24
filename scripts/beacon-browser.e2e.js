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
  throw new Error('.env.test is missing A/B browser test credentials.');
}

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const names = { A: `Beacon Browser A ${runId}`, B: `Beacon Browser B ${runId}` };
const screenshotDir = path.join(repoRoot, '.artifacts', 'beacon-e2e', `browser-${runId}`);
fs.mkdirSync(screenshotDir, { recursive: true });
const outcomes = Array.from({ length: 6 }, (_, index) => ({
  step: index + 1,
  status: 'NOT VERIFIED',
  evidence: 'Not reached.'
}));
const users = {};
const createdProfileIds = [];
const rateLimitEventIds = new Set();
const realtimeFrames = [];
const realtimeSocketEvents = [];
const messageFetchEvents = [];
const bRealtimeSocketRoutes = [];
const matchingMessageFrames = new Set();

let db;
let dbConnected = false;
let browser;
let contextA;
let contextB;
let pageA;
let pageB;
let requestId = null;
let conversationId = null;
let rateLimitBaseline = 0;
let preflightPassed = false;
let requestAckObserved = false;
let matchingRequestFrame = false;
let matchingConnectionFrame = false;
let firstMessage = '';
let secondMessage = '';
let thirdMessage = '';
let offlineMessage = '';
let reachedStep = 1;
let failurePage = null;
let failurePageLabel = '';
let failureMessageBody = '';

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

function report(step, status, evidence) {
  outcomes[step - 1] = { step, status, evidence: redact(evidence) };
  console.log(`STEP ${step} ${status}: ${redact(evidence)}`);
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

async function screenshot(page, filename) {
  if (page) await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: true });
}

async function login(page, label) {
  await page.goto('http://127.0.0.1:3000/#sign-in', { waitUntil: 'domcontentloaded' });
  await page.locator('cn-input[type="email"] input').fill(accounts[label].email);
  await page.locator('cn-input[type="password"] input').fill(accounts[label].password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/#home(?:$|\?)/, { timeout: 20000 });
}

async function openBeaconHome(page) {
  await page.goto('http://127.0.0.1:3000/#beacon-home', { waitUntil: 'domcontentloaded' });
  await page.locator('#bc-tab-circle').waitFor({ timeout: 15000 });
  await page.locator('#bc-tab-circle').click();
  await page.locator('#bc-member-list').waitFor({ timeout: 10000 });
}

async function openChat(page, memberName) {
  await page.getByRole('button', {
    name: `Message ${memberName}`,
    exact: true
  }).click({ timeout: 6000 });
  await page.locator('#chat-text-input').waitFor({ timeout: 15000 });
}

async function sendMessage(page, text) {
  failurePage = page;
  failurePageLabel = page === pageA ? 'A' : page === pageB ? 'B' : 'unknown';
  failureMessageBody = text;
  await page.locator('#chat-text-input').fill(text);
  await page.locator('#chat-send-btn').click();
  const visible = await waitFor(() => page.locator('.chat-body .m-bubble')
    .getByText(text, { exact: true }).count().then((count) => count === 1), 12000);
  if (!visible) {
    let persisted = [];
    if (conversationId) {
      const rows = await db.query(
        `SELECT id, type, body, created_at FROM public.messages
          WHERE conversation_id = $1 AND body = $2
          ORDER BY created_at DESC LIMIT 3`,
        [conversationId, text]
      );
      persisted = rows.rows;
    }
    const visibleText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600);
    await screenshot(page, `step-${reachedStep}-${failurePageLabel.toLowerCase()}-failure.png`);
    throw new Error(
      `Sender ${failurePageLabel} did not render message; database rows=${JSON.stringify(persisted)}; `
      + `visible state=${visibleText}`
    );
  }
  failurePage = null;
  failurePageLabel = '';
  failureMessageBody = '';
}

async function countMessage(page, text) {
  return page.locator('.chat-body .m-bubble').getByText(text, { exact: true }).count();
}

async function captureRealtime(context, page, label) {
  const session = await context.newCDPSession(page);
  await session.send('Network.enable');
  session.on('Network.webSocketCreated', (event) => {
    realtimeSocketEvents.push({
      label,
      kind: 'created',
      requestId: event.requestId,
      at: Date.now()
    });
  });
  session.on('Network.webSocketClosed', (event) => {
    realtimeSocketEvents.push({
      label,
      kind: 'closed',
      requestId: event.requestId,
      at: Date.now()
    });
  });
  session.on('Network.requestWillBeSent', (event) => {
    try {
      const url = new URL(event.request.url);
      if (label === 'B' && event.request.method === 'GET'
          && url.pathname.endsWith('/rest/v1/messages')) {
        messageFetchEvents.push({ at: Date.now(), pathname: url.pathname });
      }
    } catch {
      // Ignore non-URL network requests.
    }
  });
  const inspect = (event, direction) => {
    try {
      const frame = JSON.parse(event.response.payloadData);
      if (!Array.isArray(frame)) return;
      realtimeFrames.push({ direction, frame, requestId: event.requestId, at: Date.now(), label });
      if (direction !== 'received') return;
      if (frame[3] === 'phx_reply' && frame[4]?.status === 'ok'
          && frame[2] === `realtime:beacon-requests:${users.B}`) {
        requestAckObserved = true;
      }
      if (frame[3] !== 'postgres_changes') return;
      const body = JSON.stringify(frame[4] || {});
      if (requestId && body.includes(requestId)) {
        if (frame[2] === `realtime:beacon-requests:${users.B}`) matchingRequestFrame = true;
        if (label === 'A') matchingConnectionFrame = true;
      }
      for (const [key, message] of [
        ['first', firstMessage],
        ['second', secondMessage],
        ['third', thirdMessage],
        ['offline', offlineMessage]
      ]) {
        if (message && body.includes(message)) matchingMessageFrames.add(key);
      }
    } catch {
      // Ignore non-JSON frames such as websocket heartbeats.
    }
  };
  session.on('Network.webSocketFrameSent', (event) => inspect(event, 'sent'));
  session.on('Network.webSocketFrameReceived', (event) => inspect(event, 'received'));
  return session;
}

function realtimeTopicFrameCount(direction, topic, eventName, status = null) {
  return realtimeFrames.filter(({ direction: frameDirection, frame }) => (
    frameDirection === direction
      && frame[2] === topic
      && frame[3] === eventName
      && (status === null || frame[4]?.status === status)
  )).length;
}

async function measureMessageTarget(page, memberName, viewportName) {
  const button = page.getByRole('button', { name: `Message ${memberName}`, exact: true });
  return measureInteractiveTarget(page, button, `Message ${memberName}`, viewportName);
}

async function measureInteractiveTarget(page, control, label, viewportName) {
  const button = control;
  const measure = () => button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const nav = document.querySelector('cn-bottom-nav');
    const navRect = nav?.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const width = navRect
      ? Math.max(0, Math.min(rect.right, navRect.right) - Math.max(rect.left, navRect.left))
      : 0;
    const height = navRect
      ? Math.max(0, Math.min(rect.bottom, navRect.bottom) - Math.max(rect.top, navRect.top))
      : 0;
    const hitButton = target === element || element.contains(target);
    return {
      control: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      bottomNav: navRect
        ? { x: navRect.x, y: navRect.y, width: navRect.width, height: navRect.height }
        : null,
      overlapArea: width * height,
      topHit: target?.id
        || (typeof target?.className === 'string' ? target.className : target?.tagName)
        || null,
      centerHitsControl: hitButton,
      centerHitByBottomNav: Boolean(nav && target && (target === nav || nav.contains(target))),
      controlOverlapsBottomNav: width > 0 && height > 0
    };
  });
  const retryIfDetached = async (operation) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await button.waitFor({ state: 'visible', timeout: 12000 });
        return await operation();
      } catch (error) {
        if (!String(error?.message).includes('not attached to the DOM') || attempt === 2) throw error;
      }
    }
    throw new Error(`Could not measure ${label}: target repeatedly detached.`);
  };
  const resting = await retryIfDetached(measure);
  const afterScroll = await retryIfDetached(async () => {
    await button.scrollIntoViewIfNeeded();
    return measure();
  });
  console.log(`CONTROL ${label} ${viewportName} resting: ${JSON.stringify(resting)}`);
  console.log(`CONTROL ${label} ${viewportName} after scroll: ${JSON.stringify(afterScroll)}`);
  const filename = label.startsWith('Message ')
    ? `geometry-${viewportName}.png`
    : `control-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${viewportName}.png`;
  await screenshot(page, filename);
  return { resting, afterScroll };
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
      + `blocks=${pairCounts.blocks}, direct chats=${pairCounts.direct_chats}; no test writes made.`
    );
  }
  const profiles = await db.query(
    'SELECT id FROM public.resident_profiles WHERE id = ANY($1::uuid[])',
    [[users.A, users.B]]
  );
  if (profiles.rowCount) {
    throw new Error(
      `Safety preflight stopped: A/B already have ${profiles.rowCount} profile row(s); `
      + 'refusing to modify dashboard test users.'
    );
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
  if (!limits.rowCount) throw new Error('Safety preflight stopped: rate-limit configuration is missing.');
  const limit = limits.rows[0];
  if (Number(limit.requests_used) >= Number(limit.requests_per_hour)
      || Number(limit.searches_used) >= Number(limit.searches_per_hour)) {
    throw new Error('Safety preflight stopped: A lacks request or search rate-limit capacity.');
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
  console.log(
    `SAFE TARGET CHECK: PASS (.env.test guard); existing connections=${pairCounts.connections}, `
    + `blocks=${pairCounts.blocks}, direct chats=${pairCounts.direct_chats}; request capacity `
    + `${limit.requests_used}/${limit.requests_per_hour}, search capacity `
    + `${limit.searches_used}/${limit.searches_per_hour}.`
  );
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
  const resultRank = await db.query(
    `SELECT count(*)::int AS preceding
       FROM public.resident_profiles AS profiles
      WHERE profiles.beacon_discoverable
        AND lower(profiles.full_name) LIKE lower($1) || '%'
        AND (profiles.full_name, profiles.id) < ($1, $2::uuid)`,
    [names.B, users.B]
  );
  if (Number(resultRank.rows[0].preceding)) {
    throw new Error('Temporary profile setup stopped: B is not first in the search result order.');
  }
  console.log('UNIQUE NAME PREFLIGHT: PASS; temporary profiles tracked for cleanup.');
}

function makeRuntimeOverride() {
  const file = path.join(repoRoot, 'apps', 'resident-pwa', 'runtime-config.js');
  const original = fs.readFileSync(file, 'utf8');
  const overridden = original
    .replace('beaconEnabled: false', 'beaconEnabled: true')
    .replace(/supabaseUrl:\s*'[^']*'/, `supabaseUrl: ${JSON.stringify(config.supabaseUrl)}`)
    .replace(/supabaseAnonKey:\s*'[^']*'/, `supabaseAnonKey: ${JSON.stringify(config.anonKey)}`);
  if (!overridden.includes('beaconEnabled: true')
      || !overridden.includes(JSON.stringify(config.supabaseUrl))
      || !overridden.includes(JSON.stringify(config.anonKey))) {
    throw new Error('Browser setup stopped: test-only runtime override did not validate.');
  }
  return overridden;
}

async function makeContext(runtime, viewport) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport,
    isMobile: viewport.width <= 480,
    hasTouch: viewport.width <= 480
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

async function trackRateLimitRows() {
  const rows = await db.query(
    `SELECT id FROM public.beacon_rate_limit_events
      WHERE user_id = $1 AND id > $2 AND action IN ('request', 'search')`,
    [users.A, rateLimitBaseline]
  );
  for (const row of rows.rows) rateLimitEventIds.add(Number(row.id));
}

async function cleanupAndVerify() {
  const chatRows = await db.query(
    `SELECT c.id FROM public.conversations AS c
      WHERE c.kind = 'direct'
        AND EXISTS (SELECT 1 FROM public.conversation_members AS ma
                     WHERE ma.conversation_id = c.id AND ma.user_id = $1)
        AND EXISTS (SELECT 1 FROM public.conversation_members AS mb
                     WHERE mb.conversation_id = c.id AND mb.user_id = $2)`,
    [users.A, users.B]
  );
  const conversationIds = new Set(chatRows.rows.map((row) => row.id));
  if (conversationId) conversationIds.add(conversationId);
  const trackedConversationIds = [...conversationIds];
  if (trackedConversationIds.length) {
    await db.query('DELETE FROM public.messages WHERE conversation_id = ANY($1::uuid[])', [trackedConversationIds]);
    await db.query('DELETE FROM public.conversation_members WHERE conversation_id = ANY($1::uuid[])', [trackedConversationIds]);
    await db.query('DELETE FROM public.conversations WHERE id = ANY($1::uuid[])', [trackedConversationIds]);
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
       (SELECT count(*)::int FROM public.beacon_blocks
         WHERE (blocker_id = $1 AND blocked_id = $2)
            OR (blocker_id = $2 AND blocked_id = $1)) AS blocks,
       (SELECT count(*)::int FROM public.conversations c
         WHERE c.kind = 'direct'
           AND EXISTS (SELECT 1 FROM public.conversation_members ma
                        WHERE ma.conversation_id = c.id AND ma.user_id = $1)
           AND EXISTS (SELECT 1 FROM public.conversation_members mb
                        WHERE mb.conversation_id = c.id AND mb.user_id = $2)) AS direct_chats,
       (SELECT count(*)::int FROM public.messages
         WHERE conversation_id = ANY($3::uuid[])) AS messages,
       (SELECT count(*)::int FROM public.resident_profiles
         WHERE id = ANY($4::uuid[])) AS temporary_profiles,
       (SELECT count(*)::int FROM public.beacon_rate_limit_events
         WHERE id = ANY($5::bigint[])) AS rate_limit_events`,
    [users.A, users.B, trackedConversationIds, createdProfileIds, trackedRateIds]
  );
  const counts = remaining.rows[0];
  console.log(`CLEANUP VERIFIED (separate query): ${Object.entries(counts)
    .map(([name, count]) => `${name}=${count}`).join(', ')}.`);
  const failed = Object.values(counts).some((count) => Number(count) !== 0);
  console.log(`CLEANUP STATUS: ${failed ? 'FAIL' : 'PASS'}.`);
  if (failed) process.exitCode = 1;
}

try {
  db = createDatabaseClient(config.databaseUrl);
  await db.connect();
  dbConnected = true;
  await preflight();
  preflightPassed = true;
  await createTemporaryProfiles();

  const runtime = makeRuntimeOverride();
  browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-sandbox']
  });
  const options = async (viewport) => makeContext(runtime, viewport);
  contextA = await options({ width: 390, height: 844 });
  contextB = await options({ width: 390, height: 844 });
  await contextB.routeWebSocket((url) => (
    url.host === new URL(config.supabaseUrl).host
      && url.pathname === '/realtime/v1/websocket'
  ), (route) => {
    bRealtimeSocketRoutes.push({ route, createdAt: Date.now() });
    route.connectToServer();
  });
  pageA = await contextA.newPage();
  pageB = await contextB.newPage();
  await Promise.all([login(pageA, 'A'), login(pageB, 'B')]);
  const cdpA = await captureRealtime(contextA, pageA, 'A');
  const cdpB = await captureRealtime(contextB, pageB, 'B');

  await pageB.goto('http://127.0.0.1:3000/#beacon-requests', { waitUntil: 'domcontentloaded' });
  await pageB.getByText('Circle requests', { exact: true }).waitFor({ timeout: 15000 });
  await waitFor(() => Promise.resolve(requestAckObserved), 10000);
  console.log(`REALTIME ACK OBSERVED IN B REQUESTS: ${requestAckObserved ? 'yes' : 'no'} (data only; not a gate).`);

  reachedStep = 1;
  await pageA.goto('http://127.0.0.1:3000/#beacon-add-to-circle', { waitUntil: 'domcontentloaded' });
  await pageA.locator('#add-search-input').waitFor({ timeout: 15000 });
  await pageA.locator('#add-search-input').fill(names.B);
  const result = pageA.locator('#add-results-section .bc-request-row')
    .filter({ has: pageA.locator('.bc-name').getByText(names.B, { exact: true }) });
  if (!await waitFor(() => result.count().then((count) => count === 1))) {
    throw new Error(`A did not find B's unique resident result. State: ${(await pageA.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  await measureInteractiveTarget(pageA, pageA.locator('#add-find-contacts-btn'), 'Add to circle Choose contact', '390x844');
  await measureInteractiveTarget(
    pageA,
    result.getByRole('button', { name: 'Request', exact: true }),
    'Add to circle Request',
    '390x844'
  );
  await result.getByRole('button', { name: 'Request', exact: true }).click();
  const pending = await waitFor(async () => {
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
  if (!pending) throw new Error('A request did not persist in pending state.');
  await trackRateLimitRows();
  await screenshot(pageA, 'step-1-a-request-sent.png');
  report(1, 'PASS', 'A searched B by name on Add to circle and created a pending request.');

  reachedStep = 2;
  let requestVisible = await waitFor(() => pageB.locator('.request-name')
    .getByText(names.A, { exact: true }).count().then((count) => count === 1), 8000);
  let reopened = false;
  if (!requestVisible) {
    await screenshot(pageB, 'step-2-b-before-reopen.png');
    await pageB.goto('http://127.0.0.1:3000/#beacon-home', { waitUntil: 'domcontentloaded' });
    await pageB.locator('#bc-tab-circle').waitFor({ timeout: 10000 });
    await pageB.goto('http://127.0.0.1:3000/#beacon-requests', { waitUntil: 'domcontentloaded' });
    await pageB.getByText('Circle requests', { exact: true }).waitFor({ timeout: 10000 });
    reopened = true;
    requestVisible = await waitFor(() => pageB.locator('.request-name')
      .getByText(names.A, { exact: true }).count().then((count) => count === 1));
  }
  matchingRequestFrame = realtimeFrames.some(({ direction, frame }) => (
    direction === 'received'
      && frame[3] === 'postgres_changes'
      && frame[2] === `realtime:beacon-requests:${users.B}`
      && JSON.stringify(frame[4] || {}).includes(requestId)
  ));
  await screenshot(pageB, 'step-2-b-request-result.png');
  if (!requestVisible) throw new Error('B did not show A request after catch-up fetch.');
  report(2, 'PASS', `B saw the request ${reopened ? 'after reopen/catch-up fetch' : 'without reload'}; matching Realtime change frame=${matchingRequestFrame ? 'yes' : 'no'}.`);

  reachedStep = 3;
  await openBeaconHome(pageA);
  const incoming = pageB.locator('.request-row')
    .filter({ has: pageB.locator('.request-name').getByText(names.A, { exact: true }) });
  await measureInteractiveTarget(
    pageB,
    incoming.getByRole('button', { name: 'Accept', exact: true }),
    'Requests Accept',
    '390x844'
  );
  await measureInteractiveTarget(
    pageB,
    incoming.getByRole('button', { name: 'Decline', exact: true }),
    'Requests Decline',
    '390x844'
  );
  await incoming.getByRole('button', { name: 'Accept', exact: true }).click();
  const accepted = await waitFor(async () => {
    const rows = await db.query('SELECT status FROM public.beacon_connections WHERE id = $1', [requestId]);
    return rows.rowCount === 1 && rows.rows[0].status === 'accepted';
  }, 12000);
  if (!accepted) throw new Error('B acceptance did not persist as accepted.');
  const member = pageA.locator('.bc-member-row .bc-name')
    .getByText(names.B, { exact: true });
  let memberVisible = await waitFor(() => member.count().then((count) => count === 1), 8000);
  let circleReopened = false;
  if (!memberVisible) {
    circleReopened = true;
    await openBeaconHome(pageA);
    memberVisible = await waitFor(() => member.count().then((count) => count === 1));
  }
  matchingConnectionFrame = realtimeFrames.some(({ direction, frame }) => (
    direction === 'received'
      && frame[3] === 'postgres_changes'
      && JSON.stringify(frame[4] || {}).includes(requestId)
  ));
  await screenshot(pageA, 'step-3-a-circle-result.png');
  await screenshot(pageB, 'step-3-b-accepted.png');
  if (!memberVisible) throw new Error('A did not show B in its circle.');
  report(3, `PASS`, `B accepted; A saw B ${circleReopened ? 'after reopening/catch-up fetch' : 'without reopening'}; matching Realtime change frame=${matchingConnectionFrame ? 'yes' : 'no'}.`);

  reachedStep = 4;
  await pageB.locator('.cn-toast').waitFor({ state: 'detached', timeout: 10000 });
  await openBeaconHome(pageB);
  await pageB.setViewportSize({ width: 1280, height: 800 });
  await pause(200);
  const desktop = await measureMessageTarget(pageB, names.A, '1280x800');
  await pageB.setViewportSize({ width: 390, height: 844 });
  await pause(200);
  const phone = await measureMessageTarget(pageB, names.A, '390x844');
  await measureInteractiveTarget(pageB, pageB.locator('#bc-share-location-btn'), 'Beacon share location', '390x844');
  await measureInteractiveTarget(pageB, pageB.locator('#bc-tab-circle'), 'Beacon circle tab', '390x844');
  const phoneCovered = phone.afterScroll.centerHitByBottomNav;
  if (phoneCovered) {
    const button = pageB.getByRole('button', { name: `Message ${names.A}`, exact: true });
    try {
      await button.click({ timeout: 6000 });
    } catch (error) {
      await screenshot(pageB, 'step-4-b-message-button-blocked.png');
      throw new Error(
        `Ordinary phone-size Message button click was blocked; no forced or synthetic click used. `
        + `geometry=${JSON.stringify(phone)}; click error=${safeError(error, config)}`
      );
    }
  }
  await openChat(pageB, names.A);
  await measureInteractiveTarget(pageB, pageB.locator('.chat-share-pin-btn'), 'Chat share location', '390x844');
  await measureInteractiveTarget(pageB, pageB.locator('#chat-text-input'), 'Chat text input', '390x844');
  await measureInteractiveTarget(pageB, pageB.locator('#chat-send-btn'), 'Chat send', '390x844');
  await openChat(pageA, names.B);
  const chats = await db.query(
    `SELECT c.id FROM public.conversations c
      WHERE c.kind = 'direct'
        AND EXISTS (SELECT 1 FROM public.conversation_members ma
                     WHERE ma.conversation_id = c.id AND ma.user_id = $1)
        AND EXISTS (SELECT 1 FROM public.conversation_members mb
                     WHERE mb.conversation_id = c.id AND mb.user_id = $2)`,
    [users.A, users.B]
  );
  if (chats.rowCount !== 1) throw new Error(`Expected one direct chat, found ${chats.rowCount}.`);
  conversationId = chats.rows[0].id;
  firstMessage = `Browser E2E ${runId} message 1`;
  await sendMessage(pageA, firstMessage);
  let firstLive = await waitFor(() => countMessage(pageB, firstMessage)
    .then((count) => count === 1), 8000);
  if (!firstLive) {
    await screenshot(pageB, 'step-4-b-before-reopen.png');
    await openBeaconHome(pageB);
    await openChat(pageB, names.A);
  }
  const firstFetched = await waitFor(() => countMessage(pageB, firstMessage)
    .then((count) => count === 1), 10000);
  const message1Frame = realtimeFrames.some(({ direction, frame }) => (
    direction === 'received'
      && frame[3] === 'postgres_changes'
      && frame[2] === `realtime:conversation:${conversationId}`
      && JSON.stringify(frame[4] || {}).includes(firstMessage)
  ));
  await screenshot(pageA, 'step-4-a-message-sent.png');
  await screenshot(pageB, 'step-4-b-message-result.png');
  if (!firstFetched) throw new Error('B did not show the first message after reopening.');
  report(4, 'PASS', `A sent the first chat message; B received it ${firstLive ? 'live with chat open' : 'only after reopening/catch-up fetch'}; matching Realtime change frame=${message1Frame ? 'yes' : 'no'}; Message control center hit nav at rest/after scroll: phone=${phone.resting.centerHitByBottomNav}/${phone.afterScroll.centerHitByBottomNav}, desktop=${desktop.resting.centerHitByBottomNav}/${desktop.afterScroll.centerHitByBottomNav}.`);

  reachedStep = 5;
  await pageB.locator('#chat-back-btn').click();
  await pageB.locator('#bc-tab-circle').waitFor({ timeout: 10000 });
  secondMessage = `Browser E2E ${runId} message 2`;
  thirdMessage = `Browser E2E ${runId} message 3`;
  await sendMessage(pageA, secondMessage);
  await sendMessage(pageA, thirdMessage);
  await openBeaconHome(pageB);
  await openChat(pageB, names.A);
  const allOnce = await waitFor(async () => {
    const counts = await Promise.all([
      countMessage(pageB, firstMessage),
      countMessage(pageB, secondMessage),
      countMessage(pageB, thirdMessage)
    ]);
    return counts.every((count) => count === 1);
  }, 12000);
  const bubbleTexts = await pageB.locator('.chat-body .m-bubble').allTextContents();
  const positions = [firstMessage, secondMessage, thirdMessage]
    .map((text) => bubbleTexts.indexOf(text));
  const inOrder = positions.every((position, index) => (
    position >= 0 && (index === 0 || position > positions[index - 1])
  ));
  const laterMessagesRealtime = matchingMessageFrames.has('second')
    || matchingMessageFrames.has('third');
  await screenshot(pageA, 'step-5-a-three-messages.png');
  await screenshot(pageB, 'step-5-b-reopened-chat.png');
  if (!allOnce || !inOrder) throw new Error(`After reopen counts=${JSON.stringify(await Promise.all([countMessage(pageB, firstMessage), countMessage(pageB, secondMessage), countMessage(pageB, thirdMessage)]))}; in-order=${inOrder}.`);
  report(5, 'PASS', `After closing B chat and sending two more, reopen showed all three exactly once and in order; matching Realtime change frame for messages 2/3=${laterMessagesRealtime ? 'yes' : 'no'} (reopen fetch used).`);

  reachedStep = 6;
  offlineMessage = `Browser E2E ${runId} offline message`;
  const conversationTopic = `realtime:conversation:${conversationId}`;
  const activeBRealtimeSocket = bRealtimeSocketRoutes.at(-1);
  if (!activeBRealtimeSocket) {
    throw new Error('No routed B Realtime websocket exists to interrupt.');
  }
  const closedSocketsBefore = realtimeSocketEvents.filter(({ label, kind }) => (
    label === 'B' && kind === 'closed'
  )).length;
  const joinsBefore = realtimeTopicFrameCount('sent', conversationTopic, 'phx_join');
  const acksBefore = realtimeTopicFrameCount('received', conversationTopic, 'phx_reply', 'ok');
  await activeBRealtimeSocket.route.close({ code: 1001, reason: 'Beacon reconnect test' });
  const socketClosed = await waitFor(() => realtimeSocketEvents.filter(({ label, kind }) => (
    label === 'B' && kind === 'closed'
  )).length > closedSocketsBefore, 10000);
  if (!socketClosed) throw new Error('B Realtime socket did not emit a close event after the routed drop.');
  console.log('STEP 6 SOCKET DROP: routed B websocket closed; CDP close event observed.');
  await screenshot(pageB, 'step-6-b-offline.png');
  await sendMessage(pageA, offlineMessage);
  const persisted = await db.query(
    'SELECT count(*)::int AS count FROM public.messages WHERE conversation_id = $1 AND body = $2',
    [conversationId, offlineMessage]
  );
  if (Number(persisted.rows[0].count) !== 1) {
    throw new Error('Offline-step message did not persist exactly once while B was offline.');
  }
  const rejoined = await waitFor(() => (
    realtimeTopicFrameCount('sent', conversationTopic, 'phx_join') > joinsBefore
    && realtimeTopicFrameCount('received', conversationTopic, 'phx_reply', 'ok') > acksBefore
  ), 30000);
  if (!rejoined) {
    throw new Error(
      `B did not rejoin and receive a successful Realtime ack after the routed socket close. `
      + `joins=${realtimeTopicFrameCount('sent', conversationTopic, 'phx_join') - joinsBefore}, `
      + `acks=${realtimeTopicFrameCount('received', conversationTopic, 'phx_reply', 'ok') - acksBefore}.`
    );
  }
  const ackAt = realtimeFrames.filter(({ direction, frame, at }) => (
    direction === 'received'
      && frame[2] === conversationTopic
      && frame[3] === 'phx_reply'
      && frame[4]?.status === 'ok'
      && at >= activeBRealtimeSocket.createdAt
  )).at(-1)?.at || Date.now();
  console.log('STEP 6 SOCKET RESTORE: new conversation join and successful ack observed.');
  const catchUpFetch = await waitFor(() => messageFetchEvents.some(({ at }) => at >= ackAt), 10000);
  if (!catchUpFetch) {
    throw new Error('The reconnect SUBSCRIBED ack was observed, but no subsequent B messages catch-up fetch was observed.');
  }
  const onlineAt = Date.now();
  const delivered = await waitFor(() => countMessage(pageB, offlineMessage)
    .then((count) => count === 1), 20000);
  const elapsed = Date.now() - onlineAt;
  const sinceAck = Date.now() - ackAt;
  const offlineRealtime = matchingMessageFrames.has('offline');
  await screenshot(pageA, 'step-6-a-message-sent.png');
  await screenshot(pageB, 'step-6-b-after-reconnect.png');
  if (!delivered) throw new Error('B did not show the offline message within 20 seconds after reconnect.');
  report(6, 'PASS', `Routed socket drop produced a CDP close, then a new conversation join and ok ack; post-ack messages fetch=${catchUpFetch ? 'yes' : 'no'}; the message appeared ${elapsed} ms after the catch-up fetch observation (${sinceAck} ms after ack); matching Realtime change frame=${offlineRealtime ? 'yes' : 'no (reconnect catch-up fetch)'}.`);

  const expectedSafetyCopy = 'Circle requests and chat are available. Live location sharing is coming soon and is not delivered to others.';
  await pageB.locator('.chat-share-pin-btn').click();
  await pageB.locator('.safety-title').waitFor({ timeout: 10000 });
  const chatGateText = (await pageB.locator('page-beacon-safety-notice').innerText()).replace(/\s+/g, ' ');
  if (!chatGateText.includes(expectedSafetyCopy) || await pageB.locator('#chat-text-input').count()) {
    throw new Error('Chat live-location shortcut did not show only the gated safety notice.');
  }
  await screenshot(pageB, 'chat-live-location-gated.png');
  console.log('LIVE LOCATION GATE PASS: Chat share-location shortcut opened the notice; no location-sharing screen mounted.');

  await pageB.locator('#cn-nav-beacon').click();
  await pageB.locator('#bc-share-location-btn').waitFor({ timeout: 15000 });
  await pageB.locator('#bc-share-location-btn').click();
  await pageB.locator('#bc-mode-modal.open').waitFor({ state: 'visible', timeout: 10000 });
  const drawPathOption = pageB.locator('#bc-opt-draw-path');
  await pageB.waitForTimeout(300);
  await drawPathOption.click({ timeout: 10000 });
  await pageB.locator('.safety-title').waitFor({ timeout: 10000 });
  const pathGateText = (await pageB.locator('page-beacon-safety-notice').innerText()).replace(/\s+/g, ' ');
  if (!pathGateText.includes(expectedSafetyCopy) || await pageB.locator('#bc-leaflet-map').count()) {
    throw new Error('Beacon draw-path shortcut did not show only the gated safety notice.');
  }
  await screenshot(pageB, 'draw-path-gated.png');
  console.log('LIVE LOCATION GATE PASS: Beacon Draw a path shortcut opened the notice; no map/share route mounted.');

  await cdpA.detach().catch(() => {});
  await cdpB.detach().catch(() => {});
} catch (error) {
  process.exitCode = 1;
  const failedPage = failurePage || (reachedStep >= 2 ? pageB : pageA);
  let visible = '';
  try {
    if (failedPage) {
      visible = (await failedPage.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 450);
      await screenshot(failedPage, `step-${reachedStep}-${failurePageLabel || 'page'}-failure.png`);
    }
  } catch {
    visible = '';
  }
  if (outcomes[reachedStep - 1].status === 'NOT VERIFIED') {
    report(
      reachedStep,
      'FAIL',
      `${failurePageLabel ? `screen=${failurePageLabel}; ` : ''}${safeError(error, config)}`
        + `${failureMessageBody ? `; message=${failureMessageBody}` : ''}`
        + `${visible ? `; visible state: ${visible}` : ''}`
    );
  } else {
    console.log(
      `POST-FLOW CHECK FAIL: ${safeError(error, config)}`
        + `${visible ? `; visible state: ${visible}` : ''}`
    );
  }
  console.log(`RUN STOPPED: ${safeError(error, config)}`);
} finally {
  await contextA?.close().catch(() => {});
  await contextB?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (dbConnected && preflightPassed) {
    try {
      await cleanupAndVerify();
    } catch (error) {
      console.log(`CLEANUP STATUS: FAIL: ${safeError(error, config)}`);
      process.exitCode = 1;
    }
  }
  if (dbConnected) await db.end().catch(() => {});
}

console.log('BROWSER E2E SUMMARY:');
for (const outcome of outcomes) {
  console.log(`STEP ${outcome.step} ${outcome.status}: ${outcome.evidence}`);
}
console.log(`REALTIME ACK OBSERVED IN B REQUESTS: ${requestAckObserved ? 'yes' : 'no'}.`);
console.log(`SCREENSHOTS: ${screenshotDir}`);
if (outcomes.some(({ status }) => status !== 'PASS')) process.exitCode = 1;
