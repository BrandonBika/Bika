import { authenticateBearer, AuthenticationError } from '../_shared/authenticate.js';
import { withCors } from '../_shared/cors.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function handleTranscribe(request, context = {}) {
  const env = context.env || {};
  const fetchImpl = context.fetchImpl || fetch;
  const respond = (body, status = 200) => withCors(jsonResponse(body, status), request, env);

  if (request.method === 'OPTIONS') return withCors(jsonResponse({}), request, env);
  if (request.method !== 'POST') {
    return respond({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  let identity;
  try {
    identity = await authenticateBearer(request, { env, fetchImpl });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return respond({ ok: false, code: 'AUTHENTICATION_UNAVAILABLE' }, error.status);
    }
    throw error;
  }
  if (!identity || identity.user.is_anonymous === true) {
    return respond({ ok: false, code: 'UNAUTHORIZED' }, 401);
  }

  return respond({
    ok: false,
    code: 'TRANSCRIPTION_DISABLED',
    message: 'Use the active Snap & Say flow.'
  }, 410);
}