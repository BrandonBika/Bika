import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  configureSupabaseClient
} from '../packages/supabase-client/src/client.js';
import { clearSession, setSession, signInWithPassword } from '../packages/supabase-client/src/auth.js';
import {
  createGroup,
  sendLocation,
  sendPath,
  sendText,
  subscribeToConversation,
  unsubscribe
} from '../apps/resident-pwa/src/features/messaging/messaging.client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testEnvPath = path.join(root, '.env.test');
const expectedContactTypes = ['location', 'path', 'text'];
const timeoutMs = 10000;

function readTestEnvironment() {
  const values = Object.create(null);
  for (const line of readFileSync(testEnvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function findProjectRefs(text) {
  return [...text.matchAll(/[a-z0-9]{20}/g)].map((match) => match[0]);
}

function verifyTarget(values) {
  const projectUrl = new URL(values.SUPABASE_URL);
  const projectRef = projectUrl.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1];
  const databaseUrl = new URL(values.DATABASE_URL);
  const databaseUser = decodeURIComponent(databaseUrl.username);
  if (!projectRef || databaseUser !== `postgres.${projectRef}`
      || !databaseUrl.hostname.endsWith('.pooler.supabase.com')
      || databaseUrl.pathname !== '/postgres') {
    throw new Error('unsafe_target');
  }

  const localRefs = [];
  for (const relativePath of [
    'supabase/.temp/project-ref',
    'supabase/.temp/linked-project.json'
  ]) {
    try {
      localRefs.push(...findProjectRefs(readFileSync(path.join(root, relativePath), 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const configPath = path.join(root, 'supabase/config.toml');
  const config = readFileSync(configPath, 'utf8');
  localRefs.push(...[...config.matchAll(/^\s*project_id\s*=\s*["']([^"']+)["']/gm)]
    .map((match) => match[1]));
  const runtimeConfig = readFileSync(path.join(root, 'apps/resident-pwa/runtime-config.js'), 'utf8');
  const runtimeUrls = [...runtimeConfig.matchAll(/https:\/\/([a-z0-9-]+)\.supabase\.co/g)]
    .map((match) => match[1]);
  if (localRefs.includes(projectRef) || runtimeUrls.includes(projectRef)) {
    throw new Error('unsafe_target');
  }
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runDatabaseQuery(values, sql) {
  const result = spawnSync('supabase', [
    'db', 'query',
    '--db-url', values.DATABASE_URL,
    '--output-format', 'json',
    '--output', 'json',
    '--workdir', root,
    sql
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  const output = `${result.stderr || ''}\n${result.stdout || ''}`
    .replaceAll(values.DATABASE_URL, '[DATABASE_URL]')
    .replaceAll(values.SUPABASE_URL, '[SUPABASE_URL]')
    .replaceAll(values.SUPABASE_ANON_KEY, '[SUPABASE_ANON_KEY]')
    .replaceAll(values.TEST_USER_PASSWORD, '[TEST_USER_PASSWORD]')
    .replaceAll(values.TEST_USER_A_EMAIL, '[TEST_USER_A_EMAIL]')
    .replaceAll(values.TEST_USER_B_EMAIL, '[TEST_USER_B_EMAIL]')
    .replaceAll(values.TEST_USER_C_EMAIL, '[TEST_USER_C_EMAIL]')
    .replace(/\S+@\S+/g, '[email]')
    .replace(/\beyJ[A-Za-z0-9._-]+\b/g, '[token]');
  const diagnostic = output.match(/(?:SQLSTATE\s+[A-Z0-9]+|ERROR:\s+[^\r\n]+)/)?.[0]
    || `exit_${result.status ?? 'unknown'}`;
  return { succeeded: result.status === 0, diagnostic, output };
}

function createResidentProfiles(values, accounts) {
  const accountValues = accounts.map((account) => (
    `(${sqlLiteral(account.user.id)}::uuid, ${sqlLiteral(`Realtime test ${account.label}`)}, ${sqlLiteral(account.email)}, '', '', now())`
  )).join(', ');
  const sql = `with inserted_profiles as (
    insert into public.resident_profiles (
      id, full_name, email, phone, address, privacy_consent_at
    )
    values ${accountValues}
    on conflict (id) do nothing
    returning id
  )
  select 'CREATED_PROFILE:' || id::text as created_profile_id
  from inserted_profiles`;
  const result = runDatabaseQuery(values, sql);
  if (!result.succeeded) {
    throw new Error(`resident_profile_setup_failed_${result.diagnostic}`);
  }
  return [...result.output.matchAll(/CREATED_PROFILE:([0-9a-f-]{36})/gi)]
    .map((match) => match[1]);
}

async function signInTestUsers(values) {
  const accounts = [];
  const results = [];
  for (const label of ['A', 'B', 'C']) {
    const email = values[`TEST_USER_${label}_EMAIL`];
    try {
      const session = await signInWithPassword({
        email,
        password: values.TEST_USER_PASSWORD
      });
      if (!session?.access_token || !session.user?.id) {
        throw new Error('missing_auth_session');
      }
      results.push({ label, succeeded: true });
      accounts.push({
        label,
        email,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: session.user
      });
    } catch (error) {
      const message = sanitizeAuthMessage(error?.message || 'No error message provided.', values);
      const suppliedCode = /^[a-z][a-z0-9_]{0,40}$/i.test(error?.code || '')
        ? error.code
        : '';
      const code = suppliedCode
        || (/^invalid login credentials\.?$/i.test(message) ? 'invalid_credentials' : 'not_provided');
      results.push({
        label,
        succeeded: false,
        status: Number.isInteger(error?.status) ? error.status : null,
        code,
        message
      });
    }
  }
  return { accounts, results };
}

function sanitizeAuthMessage(message, values) {
  let sanitized = String(message);
  for (const secret of [
    values.SUPABASE_URL,
    values.SUPABASE_ANON_KEY,
    values.DATABASE_URL,
    values.TEST_USER_PASSWORD,
    values.TEST_USER_A_EMAIL,
    values.TEST_USER_B_EMAIL,
    values.TEST_USER_C_EMAIL
  ]) {
    if (secret) sanitized = sanitized.replaceAll(secret, '[redacted]');
  }
  return sanitized
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\beyJ[A-Za-z0-9._-]+\b/g, '[token]')
    .replace(/(apikey|key|password|token)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[redacted]');
}

function cleanupCreatedData(values, conversation, createdProfileIds) {
  if (!conversation && createdProfileIds.length === 0) {
    return {
      succeeded: true,
      messagesRemoved: 0,
      conversationsRemoved: 0,
      profilesRemoved: 0,
      remainingMessages: 0,
      remainingConversations: 0,
      remainingProfiles: 0,
      diagnostic: null
    };
  }

  const conversationId = conversation?.id || null;
  const conversationPredicate = conversationId
    ? `id = ${sqlLiteral(conversationId)}::uuid`
    : 'false';
  const ownershipPredicate = conversation
    ? `created_by = ${sqlLiteral(conversation.createdBy)}::uuid
       and title = ${sqlLiteral(conversation.title)}`
    : 'false';
  const profilePredicate = createdProfileIds.length > 0
    ? `id in (${createdProfileIds.map((id) => `${sqlLiteral(id)}::uuid`).join(', ')})`
    : 'false';
  const deleteSql = `with candidate as materialized (
    select id
    from public.conversations
    where ${conversationPredicate}
      and ${ownershipPredicate}
  ),
  deleted_messages as (
    delete from public.messages as messages
    using candidate
    where messages.conversation_id = candidate.id
    returning messages.id
  ),
  deleted_members as (
    delete from public.conversation_members as members
    using candidate
    where members.conversation_id = candidate.id
      and (select count(*) from deleted_messages) >= 0
    returning members.conversation_id
  ),
  deleted_conversations as (
    delete from public.conversations as conversations
    using candidate
    where conversations.id = candidate.id
      and (select count(*) from deleted_members) >= 0
    returning conversations.id
  ),
  deleted_profiles as (
    delete from public.resident_profiles as profiles
    where ${profilePredicate}
      and (select count(*) from deleted_conversations) >= 0
    returning profiles.id
  )
  select
    'CLEANUP_DELETED messages=' || (select count(*) from deleted_messages)::text
      || ' members_removed=' || (select count(*) from deleted_members)::text
      || ' conversations_removed=' || (select count(*) from deleted_conversations)::text
      || ' profiles_removed=' || (select count(*) from deleted_profiles)::text as cleanup_deleted`;
  const deleted = runDatabaseQuery(values, deleteSql);
  const deletedCounts = deleted.output.match(/CLEANUP_DELETED messages=(\d+) members_removed=(\d+) conversations_removed=(\d+) profiles_removed=(\d+)/);
  if (!deleted.succeeded || !deletedCounts) {
    return { succeeded: false, diagnostic: deleted.diagnostic, counts: null };
  }
  const [, messagesRemoved, membersRemoved, conversationsRemoved, profilesRemoved] = deletedCounts;
  const verifySql = `select
    'CLEANUP_REMAINING messages=' || (
      select count(*) from public.messages
      where ${conversationId ? `conversation_id = ${sqlLiteral(conversationId)}::uuid` : 'false'}
    )::text
      || ' members=' || (
        select count(*) from public.conversation_members
        where ${conversationId ? `conversation_id = ${sqlLiteral(conversationId)}::uuid` : 'false'}
      )::text
      || ' conversations=' || (
        select count(*) from public.conversations
        where ${conversationPredicate}
      )::text
      || ' profiles=' || (
        select count(*) from public.resident_profiles
        where ${profilePredicate}
      )::text as cleanup_remaining`;
  const verified = runDatabaseQuery(values, verifySql);
  const remainingCounts = verified.output.match(/CLEANUP_REMAINING messages=(\d+) members=(\d+) conversations=(\d+) profiles=(\d+)/);
  if (!verified.succeeded || !remainingCounts) {
    return { succeeded: false, diagnostic: verified.diagnostic, counts: null };
  }
  const [, remainingMessages, remainingMembers, remainingConversations, remainingProfiles] = remainingCounts;
  return {
    succeeded: [remainingMessages, remainingMembers, remainingConversations, remainingProfiles]
      .every((count) => Number(count) === 0),
    counts: true,
    messagesRemoved: Number(messagesRemoved),
    membersRemoved: Number(membersRemoved),
    conversationsRemoved: Number(conversationsRemoved),
    profilesRemoved: Number(profilesRemoved),
    remainingMessages: Number(remainingMessages),
    remainingMembers: Number(remainingMembers),
    remainingConversations: Number(remainingConversations),
    remainingProfiles: Number(remainingProfiles),
    diagnostic: verified.diagnostic
  };
}

function inspectConversationMessages(values, conversationId, senderId) {
  const sql = `select
    'DB_MESSAGE type=' || type
      || ' created_at=' || to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      || ' sender_is_B=' || (sender_id = ${sqlLiteral(senderId)}::uuid)::text as message_evidence
    from public.messages
    where conversation_id = ${sqlLiteral(conversationId)}::uuid
    order by created_at, id`;
  const result = runDatabaseQuery(values, sql);
  const rows = [...result.output.matchAll(/DB_MESSAGE type=([a-z_]+) created_at=([0-9T:+.Z-]+) sender_is_B=(true|false)/g)]
    .map((match) => ({ type: match[1], createdAt: match[2], senderIsB: match[3] === 'true' }));
  return { succeeded: result.succeeded, rows, diagnostic: result.diagnostic };
}

function cleanupPreviousTestData(values) {
  const accounts = ['A', 'B', 'C'].map((label) => ({
    label,
    email: values[`TEST_USER_${label}_EMAIL`]
  }));
  const userRows = accounts.map((account) => (
    `(${sqlLiteral(account.label)}, lower(${sqlLiteral(account.email)}))`
  )).join(', ');
  const sql = `with target_users(label, email) as (
    values ${userRows}
  ),
  test_users as (
    select target_users.label, users.id
    from target_users
    join auth.users as users on lower(users.email) = target_users.email
  ),
  candidate_conversations as (
    select conversations.id
    from public.conversations as conversations
    join test_users as account_a
      on account_a.label = 'A' and account_a.id = conversations.created_by
    join test_users as account_b on account_b.label = 'B'
    where conversations.kind = 'group'
      and conversations.title like 'Realtime test %'
      and exists (
        select 1 from public.conversation_members as members
        where members.conversation_id = conversations.id
          and members.user_id = account_a.id
      )
      and exists (
        select 1 from public.conversation_members as members
        where members.conversation_id = conversations.id
          and members.user_id = account_b.id
      )
      and exists (
        select 1 from public.messages as messages
        where messages.conversation_id = conversations.id
          and messages.sender_id = account_b.id
          and messages.type = 'text'
          and messages.body = 'Realtime text verification'
      )
      and exists (
        select 1 from public.messages as messages
        where messages.conversation_id = conversations.id
          and messages.sender_id = account_b.id
          and messages.type = 'location'
          and messages.payload = '{"lat":-29.8,"lng":31.0,"accuracy":8}'::jsonb
      )
      and exists (
        select 1 from public.messages as messages
        where messages.conversation_id = conversations.id
          and messages.sender_id = account_b.id
          and messages.type = 'path'
          and messages.payload = '{"points":[[-29.8,31.0],[-29.81,31.01]]}'::jsonb
      )
      and exists (
        select 1 from public.messages as messages
        where messages.conversation_id = conversations.id
          and messages.sender_id = account_b.id
          and messages.type = 'text'
          and messages.body = 'Realtime unsubscribe verification'
      )
  ),
  deleted_conversations as (
    delete from public.conversations as conversations
    using candidate_conversations
    where conversations.id = candidate_conversations.id
    returning conversations.id
  ),
  deleted_profiles as (
    delete from public.resident_profiles as profiles
    using test_users
    where profiles.id = test_users.id
      and profiles.full_name = 'Realtime test ' || test_users.label
      and profiles.phone = ''
      and profiles.address = ''
      and profiles.created_at >= pg_catalog.now() - interval '1 hour'
    returning profiles.id
  )
  select
    (select count(*) from deleted_conversations) as deleted_conversations,
    (select count(*) from deleted_profiles) as deleted_profiles`;
  return runDatabaseQuery(values, sql);
}

function validateCredentials(values) {
  return Boolean(
    values.SUPABASE_URL
    && values.SUPABASE_ANON_KEY
    && values.DATABASE_URL
    && values.TEST_USER_PASSWORD
    && ['A', 'B', 'C'].every((label) => values[`TEST_USER_${label}_EMAIL`])
  );
}

function assertEnvIgnored() {
  const result = spawnSync('git', ['check-ignore', '-q', '.env.test'], {
    cwd: root,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error('test_env_not_ignored');
  }
}

function categorizeFailure(error) {
  const message = String(error?.message || '');
  if (/unsafe_target/.test(message)) return 'unsafe_target';
  if (/test_env_not_ignored/.test(message)) return 'test_env_not_ignored';
  if (/resident_profile_setup_failed/.test(message)) return 'resident_profile_setup_failed';
  if (/member_delivery_timeout/.test(message)) return 'member_delivery_timeout';
  if (/Realtime must reject/.test(message)) return 'invalid_token_not_rejected';
  if (/outsider/.test(message)) return 'outsider_received_message';
  if (/Unsubscribed/.test(message)) return 'unsubscribe_delivery_continued';
  if (/Realtime subscriptions/.test(message)) return 'realtime_transport_error';
  if (/subscription timed out/.test(message)) return 'realtime_subscription_timeout';
  return 'setup_or_assertion_failed';
}

function messageType(event) {
  const record = event?.record || event?.new || event?.data?.record || event?.data?.new;
  return record?.type;
}

function messageRecord(event) {
  return event?.record || event?.new || event?.data?.record || event?.data?.new;
}

function reportCheck(name, succeeded, evidence) {
  console.log(`CHECK ${name}=${succeeded ? 'PASS' : 'FAIL'} ${evidence}`);
}

function realtimeErrorCategory(error, values) {
  const message = sanitizeAuthMessage(error?.message || '', values).toLowerCase();
  if (/timed?\s*out|timeout/.test(message)) return 'timeout';
  if (/jwt.*expir|expir.*jwt/.test(message)) return 'jwt_expired';
  if (/malformed\s*jwt/.test(message)) return 'invalid_jwt';
  if (/invalid.*jwt|jwt.*invalid/.test(message)) return 'invalid_jwt';
  if (/invalid.*token|token.*invalid/.test(message)) return 'invalid_token';
  if (/unauthori[sz]ed|not authenticated|authentication/.test(message)) return 'unauthorized';
  return message.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64) || 'unknown';
}

async function waitFor(predicate) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return predicate();
}

async function run() {
  const values = readTestEnvironment();
  if (!validateCredentials(values)) {
    throw new Error('missing_test_settings');
  }
  assertEnvIgnored();
  verifyTarget(values);
  if (process.argv.includes('--cleanup-previous-test-data')) {
    const result = cleanupPreviousTestData(values);
    if (!result.succeeded) {
      console.error(`REALTIME_E2E_CLEANUP=FAIL diagnostic=${result.diagnostic}`);
      process.exitCode = 1;
      return;
    }
    console.log('REALTIME_E2E_CLEANUP=PASS scoped prior E2E artifacts only; dashboard users retained');
    return;
  }
  configureSupabaseClient({
    url: values.SUPABASE_URL,
    anonKey: values.SUPABASE_ANON_KEY
  });

  const subscriptions = [];
  let createdProfileIds = [];
  let conversation = null;
  let databaseEvidence = null;
  let cleanupSucceeded = null;
  let failure = null;
  let hasCheckFailure = false;
  let phase = 'sign_in';

  const { accounts, results } = await signInTestUsers(values);
  for (const result of results) {
    if (result.succeeded) {
      console.log(`AUTH_SIGN_IN ${result.label}=PASS`);
    } else {
      const status = result.status === null ? 'unknown' : String(result.status);
      console.log(`AUTH_SIGN_IN ${result.label}=FAIL status=${status} code=${result.code} message="${result.message}"`);
    }
  }
  if (results.some((result) => !result.succeeded)) {
    console.error('REALTIME_E2E=NOT RUN; one or more password sign-ins failed.');
    process.exitCode = 1;
    clearSession();
    return;
  }

  try {
    const [accountA, accountB, accountC] = accounts;
    phase = 'resident_profile_setup';
    createdProfileIds = createResidentProfiles(values, accounts);

    phase = 'create_conversation';
    setSession(accountA.access_token, accountA.user, accountA.refresh_token);
    const conversationTitle = `Realtime test ${randomUUID()}`;
    conversation = {
      id: await createGroup(conversationTitle, [accountB.user.id]),
      createdBy: accountA.user.id,
      title: conversationTitle
    };
    const conversationId = conversation.id;

    phase = 'invalid_token';
    const invalidToken = 'invalid.expired.realtime.token';
    setSession(invalidToken, accountA.user, accountA.refresh_token);
    const invalidSubscription = subscribeToConversation(conversationId, () => {}, () => {});
    subscriptions.push(invalidSubscription);
    let invalidTokenError = null;
    try {
      await invalidSubscription.ready;
    } catch (error) {
      invalidTokenError = error;
    }
    unsubscribe(invalidSubscription);
    const invalidTokenCategory = invalidTokenError
      ? realtimeErrorCategory(invalidTokenError, values)
      : 'subscription_succeeded';
    const invalidTokenRejected = Boolean(
      invalidTokenError
      && ['invalid_jwt', 'jwt_expired', 'invalid_token', 'unauthorized'].includes(invalidTokenCategory)
    );
    reportCheck(
      'invalid_token',
      invalidTokenRejected,
      `server_category=${invalidTokenCategory}`
    );
    subscriptions.splice(subscriptions.indexOf(invalidSubscription), 1);

    phase = 'member_subscribe';
    const messagesA = [];
    const errors = [];
    setSession(accountA.access_token, accountA.user, accountA.refresh_token);
    const subscriptionA = subscribeToConversation(
      conversationId,
      (event) => messagesA.push({
        type: messageType(event),
        senderId: messageRecord(event)?.sender_id
      }),
      (error) => errors.push(error)
    );
    subscriptions.push(subscriptionA);

    phase = 'outsider_subscribe';
    const messagesC = [];
    setSession(accountC.access_token, accountC.user, accountC.refresh_token);
    const subscriptionC = subscribeToConversation(
      conversationId,
      (event) => messagesC.push({
        type: messageType(event),
        senderId: messageRecord(event)?.sender_id
      }),
      (error) => errors.push(error)
    );
    subscriptions.push(subscriptionC);
    await subscriptionA.ready;
    const subscriptionAConfirmedAt = new Date().toISOString();
    await subscriptionC.ready;
    const subscriptionCConfirmedAt = new Date().toISOString();
    console.log(`REALTIME_SUBSCRIBED A=${subscriptionAConfirmedAt} C=${subscriptionCConfirmedAt}`);

    phase = 'send_messages';
    setSession(accountB.access_token, accountB.user, accountB.refresh_token);
    const sendRecords = [];
    for (const [type, send] of [
      ['text', () => sendText(conversationId, 'Realtime text verification')],
      ['location', () => sendLocation(conversationId, { lat: -29.8, lng: 31.0, accuracy: 8 })],
      ['path', () => sendPath(conversationId, [[-29.8, 31.0], [-29.81, 31.01]])]
    ]) {
      const startedAt = new Date().toISOString();
      const sentRow = await send();
      const completedAt = new Date().toISOString();
      sendRecords.push({ type, startedAt, completedAt, createdAt: sentRow?.created_at || 'not_returned' });
      console.log(`MESSAGE_SENT type=${type} started_at=${startedAt} completed_at=${completedAt} db_created_at=${sentRow?.created_at || 'not_returned'}`);
    }
    console.log(`TEXT_AFTER_SUBSCRIPTION_CONFIRMED=${Date.parse(sendRecords[0].startedAt) >= Date.parse(subscriptionAConfirmedAt)}`);

    phase = 'delivery';
    await waitFor(() => messagesA.length >= 3);
    const deliveredTypes = messagesA.map((message) => message.type);
    const deliveredByB = messagesA.every((message) => message.senderId === accountB.user.id);
    const deliveredExactlyOnce = expectedContactTypes.every(
      (type) => deliveredTypes.filter((receivedType) => receivedType === type).length === 1
    );
    const memberDeliveryPassed = messagesA.length === 3 && deliveredExactlyOnce && deliveredByB;
    reportCheck(
      'member_delivery',
      memberDeliveryPassed,
      `count=${messagesA.length} types=${deliveredTypes.join(',') || 'none'} all_from_B=${deliveredByB}`
    );
    hasCheckFailure ||= !memberDeliveryPassed;

    phase = 'database_message_rows';
    databaseEvidence = inspectConversationMessages(values, conversationId, accountB.user.id);
    const databaseTypes = databaseEvidence.rows.map((row) => row.type);
    console.log(`DATABASE_MESSAGES ${databaseEvidence.succeeded ? 'QUERY_OK' : 'QUERY_FAIL'} count=${databaseEvidence.rows.length} types=${databaseTypes.join(',') || 'none'} rows=${databaseEvidence.rows.map((row) => `${row.type}@${row.createdAt}:sender_is_B_${row.senderIsB}`).join(';') || 'none'}`);
    const allExpectedRowsPersisted = databaseEvidence.succeeded
      && databaseEvidence.rows.length === 3
      && expectedContactTypes.every((type) => databaseTypes.filter((item) => item === type).length === 1)
      && databaseEvidence.rows.every((row) => row.senderIsB);
    reportCheck(
      'database_message_rows',
      allExpectedRowsPersisted,
      `count=${databaseEvidence.rows.length} types=${databaseTypes.join(',') || 'none'}`
    );
    hasCheckFailure ||= !allExpectedRowsPersisted;

    phase = 'outsider_isolation';
    await new Promise((resolve) => setTimeout(resolve, 500));
    const outsiderPassed = messagesC.length === 0;
    reportCheck(
      'outsider_isolation',
      outsiderPassed,
      `count=${messagesC.length} period=same_message_delivery_window`
    );
    hasCheckFailure ||= !outsiderPassed;

    phase = 'unsubscribe';
    const receivedBeforeUnsubscribe = messagesA.length;
    unsubscribe(subscriptionA);
    subscriptions.splice(subscriptions.indexOf(subscriptionA), 1);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await sendText(conversationId, 'Realtime unsubscribe verification');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const receivedAfterUnsubscribe = messagesA.length - receivedBeforeUnsubscribe;
    const unsubscribePassed = receivedAfterUnsubscribe === 0;
    reportCheck(
      'unsubscribe',
      unsubscribePassed,
      `new_messages_received=${receivedAfterUnsubscribe}`
    );
    hasCheckFailure ||= !unsubscribePassed;
    const outsiderAfterUnsubscribePassed = messagesC.length === 0;
    reportCheck(
      'outsider_after_unsubscribe',
      outsiderAfterUnsubscribePassed,
      `count=${messagesC.length}`
    );
    hasCheckFailure ||= !outsiderAfterUnsubscribePassed;
    const subscriptionsErrorFree = errors.length === 0;
    reportCheck(
      'subscription_errors',
      subscriptionsErrorFree,
      `count=${errors.length}`
    );
    hasCheckFailure ||= !subscriptionsErrorFree;
  } catch (error) {
    failure = `${phase}_${categorizeFailure(error)}`;
    console.log(`CHECK ${phase}=FAIL evidence=${sanitizeAuthMessage(error?.message || 'unobserved', values)}`);
  } finally {
    for (const subscription of subscriptions) {
      unsubscribe(subscription);
    }
    clearSession();
    if (conversation && databaseEvidence === null) {
      databaseEvidence = inspectConversationMessages(values, conversation.id, accounts[1].user.id);
      const observedTypes = databaseEvidence.rows.map((row) => row.type);
      console.log(`CHECK database_message_rows=NOT VERIFIED query_ok=${databaseEvidence.succeeded} count=${databaseEvidence.rows.length} types=${observedTypes.join(',') || 'none'} diagnostic=${databaseEvidence.diagnostic}`);
      console.log(`DATABASE_MESSAGES ${databaseEvidence.succeeded ? 'QUERY_OK' : 'QUERY_FAIL'} count=${databaseEvidence.rows.length} types=${observedTypes.join(',') || 'none'} rows=${databaseEvidence.rows.map((row) => `${row.type}@${row.createdAt}:sender_is_B_${row.senderIsB}`).join(';') || 'none'}`);
    }
    const cleanup = cleanupCreatedData(values, conversation, createdProfileIds);
    cleanupSucceeded = cleanup.succeeded;
    const cleanupEvidence = cleanup.counts
      ? `messages_removed=${cleanup.messagesRemoved} members_removed=${cleanup.membersRemoved} conversations_removed=${cleanup.conversationsRemoved} profiles_removed=${cleanup.profilesRemoved} remaining_messages=${cleanup.remainingMessages} remaining_members=${cleanup.remainingMembers} remaining_conversations=${cleanup.remainingConversations} remaining_profiles=${cleanup.remainingProfiles} remaining_test_rows=${cleanup.remainingMessages + cleanup.remainingMembers + cleanup.remainingConversations + cleanup.remainingProfiles}`
      : `counts=unavailable diagnostic=${cleanup.diagnostic || 'none'}`;
    console.log(`CHECK cleanup=${cleanupSucceeded ? 'PASS' : 'FAIL'} ${cleanupEvidence}`);
  }

  if (cleanupSucceeded === false) {
    console.error('REALTIME_E2E_CLEANUP=FAIL');
    process.exitCode = 1;
  } else {
    console.log('REALTIME_E2E_CLEANUP=PASS');
  }
  if (failure) {
    console.error(`REALTIME_E2E=FAIL check=${failure}`);
    process.exitCode = 1;
  } else if (hasCheckFailure) {
    console.error('REALTIME_E2E=FAIL one_or_more_checks_failed');
    process.exitCode = 1;
  } else if (cleanupSucceeded === true) {
    console.log('REALTIME_E2E=PASS all observed checks passed; dashboard users retained');
  }
}

run().catch((error) => {
  console.error(`REALTIME_E2E=FAIL check=${categorizeFailure(error)}`);
  process.exitCode = 1;
});
