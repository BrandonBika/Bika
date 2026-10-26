import { withCors } from '../_shared/cors.js';

const TOKEN_TTL_SECONDS = 60 * 60;
const MAX_RECIPIENTS = 100;
const IV_CHARACTERS = '0123456789abcdefghijklmnopqrstuvwxyz';
const textEncoder = new TextEncoder();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function readConfiguration(env) {
  const appId = Number(env.ZEGO_APP_ID);
  const serverSecret = env.ZEGO_SERVER_SECRET;
  if (!Number.isSafeInteger(appId) || appId <= 0 || typeof serverSecret !== 'string' || serverSecret.length !== 32) {
    throw new Error('ZEGOCLOUD token service is not configured.');
  }
  return { appId, serverSecret };
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function generateToken04(appId, userId, secret, effectiveTimeInSeconds = TOKEN_TTL_SECONDS, payload = '') {
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new TypeError('A valid ZEGO AppID is required.');
  if (typeof userId !== 'string' || !userId || Buffer.byteLength(userId) > 32) {
    throw new TypeError('A valid ZEGO user ID is required.');
  }
  if (typeof secret !== 'string' || Buffer.byteLength(secret) !== 32) {
    throw new TypeError('The ZEGO ServerSecret must contain 32 bytes.');
  }
  if (!Number.isInteger(effectiveTimeInSeconds) || effectiveTimeInSeconds < 1 || effectiveTimeInSeconds > 3600) {
    throw new RangeError('Token validity must be between 1 and 3600 seconds.');
  }

  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = createdAt + effectiveTimeInSeconds;
  const nonceBytes = crypto.getRandomValues(new Uint8Array(4));
  const tokenInfo = JSON.stringify({
    app_id: appId,
    user_id: userId,
    nonce: new DataView(nonceBytes.buffer).getInt32(0),
    ctime: createdAt,
    expire: expiresAt,
    payload
  });
  const ivBytes = crypto.getRandomValues(new Uint8Array(16));
  let iv = '';
  for (const byte of ivBytes) iv += IV_CHARACTERS[byte % IV_CHARACTERS.length];
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(secret), { name: 'AES-CBC' }, false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-CBC',
    iv: textEncoder.encode(iv)
  }, key, textEncoder.encode(tokenInfo)));
  const header = new Uint8Array(12);
  const headerView = new DataView(header.buffer);
  headerView.setBigInt64(0, BigInt(expiresAt));
  headerView.setUint16(8, textEncoder.encode(iv).length);
  headerView.setUint16(10, encrypted.length);
  const tokenBytes = new Uint8Array(10 + textEncoder.encode(iv).length + 2 + encrypted.length);
  tokenBytes.set(header.subarray(0, 10), 0);
  tokenBytes.set(textEncoder.encode(iv), 10);
  tokenBytes.set(header.subarray(10), 10 + textEncoder.encode(iv).length);
  tokenBytes.set(encrypted, 12 + textEncoder.encode(iv).length);
  return `04${toBase64(tokenBytes)}`;
}

function toZegoUserId(authUserId) {
  if (typeof authUserId !== 'string' || !UUID_PATTERN.test(authUserId)) {
    throw new TypeError('A valid Supabase user ID is required.');
  }
  return authUserId.replaceAll('-', '');
}

function readRecipientIds(body, callerId) {
  if (!Array.isArray(body?.recipientIds)
      || body.recipientIds.length > MAX_RECIPIENTS) {
    return null;
  }
  const ids = body.recipientIds;
  if (ids.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id))
      || new Set(ids.map((id) => id.toLowerCase())).size !== ids.length
      || ids.some((id) => id.toLowerCase() === callerId.toLowerCase())) {
    return null;
  }
  return ids.map((id) => id.toLowerCase());
}

async function fetchRows(url, authorization, anonKey, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { apikey: anonKey, authorization }
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows : null;
}

async function handleZegoTokenInternal(request, {
  env,
  supabaseUrl,
  anonKey,
  fetchImpl = fetch
}) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return json({ error: 'A Supabase access token is required.' }, 401);

  let configuration;
  try {
    configuration = readConfiguration(env);
  } catch {
    return json({ error: 'Call service is not configured.' }, 503);
  }

  if (!supabaseUrl || !anonKey) return json({ error: 'Authentication service is not configured.' }, 503);

  let authResponse;
  try {
    authResponse = await fetchImpl(new URL('/auth/v1/user', supabaseUrl), {
      headers: { apikey: anonKey, authorization: `Bearer ${match[1]}` }
    });
  } catch {
    return json({ error: 'Could not verify the Supabase session.' }, 502);
  }
  if (!authResponse.ok) return json({ error: 'The Supabase access token is invalid or expired.' }, 401);

  let user;
  try {
    user = await authResponse.json();
  } catch {
    return json({ error: 'Supabase returned an invalid user response.' }, 502);
  }
  if (typeof user?.id !== 'string' || !user.id || user.is_anonymous === true) {
    return json({ error: 'A signed-in resident account is required.' }, 401);
  }

  try {
    const userId = toZegoUserId(user.id);
    let body;
    try {
      const rawBody = await request.text();
      if (rawBody.length > 8192) return json({ error: 'The request is too large.' }, 413);
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: 'A recipient list is required.' }, 400);
    }
    const recipientIds = readRecipientIds(body, user.id);
    if (!recipientIds) return json({
      error: `One to ${MAX_RECIPIENTS} valid call recipients are required.`
    }, 400);

    if (recipientIds.length) {
      const relationships = new URL('/rest/v1/beacon_connections', supabaseUrl);
      relationships.searchParams.set('select', 'requester_id,addressee_id');
      relationships.searchParams.set('status', 'eq.accepted');
      relationships.searchParams.set('or', `(requester_id.eq.${user.id},addressee_id.eq.${user.id})`);
      const blocks = new URL('/rest/v1/beacon_blocks', supabaseUrl);
      blocks.searchParams.set('select', 'blocker_id,blocked_id');
      blocks.searchParams.set('or', `(blocker_id.eq.${user.id},blocked_id.eq.${user.id})`);

      let connections;
      let blockRows;
      try {
        [connections, blockRows] = await Promise.all([
          fetchRows(relationships, authorization, anonKey, fetchImpl),
          fetchRows(blocks, authorization, anonKey, fetchImpl)
        ]);
      } catch {
        return json({ error: 'Could not verify call recipients.' }, 502);
      }
      if (!connections || !blockRows) return json({ error: 'Could not verify call recipients.' }, 502);

      const accepted = new Set(connections.map((connection) => {
        const requester = String(connection.requester_id || '').toLowerCase();
        const addressee = String(connection.addressee_id || '').toLowerCase();
        return requester === user.id.toLowerCase() ? addressee : requester;
      }));
      const blocked = new Set(blockRows.map((block) => {
        const blocker = String(block.blocker_id || '').toLowerCase();
        const blockedId = String(block.blocked_id || '').toLowerCase();
        return blocker === user.id.toLowerCase() ? blockedId : blocker;
      }));
      if (recipientIds.some((id) => !accepted.has(id) || blocked.has(id))) {
        return json({ error: 'Call recipients must be accepted, unblocked Beacon connections.' }, 403);
      }
    }

    const token = await generateToken04(configuration.appId, userId, configuration.serverSecret);
    return json({ appId: configuration.appId, userId, token, expiresIn: TOKEN_TTL_SECONDS });
  } catch {
    return json({ error: 'Could not create a call token.' }, 500);
  }
}

export async function handleZegoToken(request, options = {}) {
  const result = await handleZegoTokenInternal(request, options);
  return withCors(result, request, options.env, {
    allowHeaders: 'authorization, apikey, content-type'
  });
}
