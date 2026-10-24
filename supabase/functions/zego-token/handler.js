import { withCors } from '../_shared/cors.js';

const TOKEN_TTL_SECONDS = 60 * 60;
const IV_CHARACTERS = '0123456789abcdefghijklmnopqrstuvwxyz';
const textEncoder = new TextEncoder();

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
  if (typeof authUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId)) {
    throw new TypeError('A valid Supabase user ID is required.');
  }
  return authUserId.replaceAll('-', '');
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
