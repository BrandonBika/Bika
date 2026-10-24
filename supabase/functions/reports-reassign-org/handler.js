import { authenticateBearer, AuthenticationError } from '../_shared/authenticate.js';
import { withCors } from '../_shared/cors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleReportsReassignOrg(request, context = {}) {
  const env = context.env || {};
  const fetchImpl = context.fetchImpl || fetch;
  const respond = (body, status = 200) => withCors(jsonResponse(body, status), request, env);

  if (request.method === 'OPTIONS') return withCors(jsonResponse({ ok: true }), request, env);
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
  if (!identity) return respond({ ok: false, code: 'UNAUTHORIZED' }, 401);

  let input;
  try {
    input = await request.json();
  } catch {
    return respond({ ok: false, code: 'INVALID_JSON' }, 400);
  }
  if (
    !input
    || typeof input !== 'object'
    || !UUID_PATTERN.test(input.report_id || '')
    || !UUID_PATTERN.test(input.organization_id || '')
    || (input.note !== undefined && input.note !== null
      && (typeof input.note !== 'string' || input.note.length > 1000))
  ) {
    return respond({ ok: false, code: 'INVALID_REQUEST' }, 422);
  }

  const response = await fetchImpl(`${identity.supabaseUrl}/rest/v1/rpc/staff_reassign_report`, {
    method: 'POST',
    headers: {
      apikey: identity.anonKey,
      Authorization: identity.authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_report_id: input.report_id,
      p_organization_id: input.organization_id,
      p_note: input.note || null
    })
  });

  if (response.status === 401) return respond({ ok: false, code: 'UNAUTHORIZED' }, 401);
  if (response.status === 403) return respond({ ok: false, code: 'PLATFORM_STAFF_REQUIRED' }, 403);
  if (response.status === 404) return respond({ ok: false, code: 'RESOURCE_NOT_FOUND' }, 404);
  if (response.status === 400 || response.status === 409 || response.status === 422) {
    return respond({ ok: false, code: 'REASSIGNMENT_REJECTED' }, 409);
  }
  if (!response.ok) return respond({ ok: false, code: 'REASSIGNMENT_FAILED' }, 502);

  return respond({ ok: true, event_id: await response.json() });
}