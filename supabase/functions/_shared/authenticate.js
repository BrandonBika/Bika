export class AuthenticationError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'AuthenticationError';
    this.status = status;
  }
}

function readEnv(env, name) {
  if (typeof env?.get === 'function') return env.get(name) || '';
  return env?.[name] || '';
}

export async function authenticateBearer(request, { env, fetchImpl = fetch } = {}) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;

  const supabaseUrl = String(readEnv(env, 'SUPABASE_URL')).replace(/\/+$/, '');
  const anonKey = readEnv(env, 'SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    throw new AuthenticationError('Authentication service is not configured.');
  }

  let response;
  try {
    response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization }
    });
  } catch {
    throw new AuthenticationError('Authentication service is unavailable.');
  }

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    throw new AuthenticationError('Authentication service is unavailable.');
  }

  const user = await response.json();
  if (!user || typeof user.id !== 'string') return null;
  return { user, authorization, supabaseUrl, anonKey };
}