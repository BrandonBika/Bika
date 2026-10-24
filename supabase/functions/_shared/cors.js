const DEVELOPMENT_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]);

function readEnv(env, name) {
  if (typeof env?.get === 'function') return env.get(name) || '';
  return env?.[name] || '';
}

function parseOrigin(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin, env) {
  const normalizedOrigin = parseOrigin(origin);
  if (!normalizedOrigin || normalizedOrigin !== origin) return false;

  const configuredOrigins = String(readEnv(env, 'ALLOWED_ORIGINS'))
    .split(',')
    .map((value) => parseOrigin(value.trim()))
    .filter(Boolean);
  if (configuredOrigins.includes(normalizedOrigin)) return true;

  const environment = [readEnv(env, 'NODE_ENV'), readEnv(env, 'APP_ENV')]
    .map((value) => String(value).toLowerCase());
  const production = environment.includes('production');
  const development = environment.includes('development');
  return !production && development && DEVELOPMENT_ORIGINS.has(normalizedOrigin);
}

export function corsHeaders(request, env, {
  allowHeaders = 'authorization, apikey, content-type, x-client-info',
  allowMethods = 'POST, OPTIONS'
} = {}) {
  const headers = new Headers({
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Methods': allowMethods,
    Vary: 'Origin'
  });
  const origin = request.headers.get('origin');
  if (origin && isAllowedOrigin(origin, env)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

export function withCors(response, request, env, options = {}) {
  const headers = corsHeaders(request, env, options);
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin');
    const allowed = !origin || isAllowedOrigin(origin, env);
    return new Response(null, { status: allowed ? 204 : 403, headers });
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('Access-Control-Allow-Origin');
  responseHeaders.delete('Access-Control-Allow-Headers');
  responseHeaders.delete('Access-Control-Allow-Methods');
  for (const [name, value] of headers) responseHeaders.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}