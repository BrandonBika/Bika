import { authenticateBearer, AuthenticationError } from '../_shared/authenticate.js';
import { withCors } from '../_shared/cors.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function readEnv(env, name) {
  if (typeof env?.get === 'function') return env.get(name) || '';
  return env?.[name] || '';
}

export async function handleOrganizationInvitationAccept(request, context = {}) {
  const env = context.env || {};
  const fetchImpl = context.fetchImpl || fetch;
  const respond = (body, status = 200) => withCors(jsonResponse(body, status), request, env);
  if (request.method === 'OPTIONS') return withCors(jsonResponse({ ok: true }), request, env);
  if (request.method !== 'POST') return respond({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);

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
  if (!identity.user.email) return respond({ ok: false, code: 'INVITATION_EMAIL_REQUIRED' }, 403);

  const serviceRoleKey = readEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) return respond({ ok: false, code: 'INVITATION_SERVICE_UNAVAILABLE' }, 503);
  const acceptResponse = await fetchImpl(`${identity.supabaseUrl}/rest/v1/rpc/accept_organization_invitation`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_user_id: identity.user.id,
      p_email: identity.user.email.toLowerCase()
    })
  });
  if (acceptResponse.status === 400 || acceptResponse.status === 404 || acceptResponse.status === 422) {
    return respond({ ok: false, code: 'INVITATION_INVALID_OR_EXPIRED' }, 410);
  }
  if (acceptResponse.status === 403) {
    return respond({ ok: false, code: 'ORGANIZATION_NOT_ACTIVE' }, 403);
  }
  if (!acceptResponse.ok) return respond({ ok: false, code: 'INVITATION_ACCEPT_FAILED' }, 502);
  const organizationId = await acceptResponse.json();
  if (typeof organizationId !== 'string') {
    return respond({ ok: false, code: 'INVITATION_ACCEPT_FAILED' }, 502);
  }
  return respond({ ok: true, organization_id: organizationId });
}
