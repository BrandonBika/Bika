import { authenticateBearer, AuthenticationError } from '../_shared/authenticate.js';
import { isAllowedOrigin, withCors } from '../_shared/cors.js';

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

export async function handleOrgsInvite(request, context = {}) {
  const env = context.env || {};
  const fetchImpl = context.fetchImpl || fetch;
  const respond = (body, status = 200) => withCors(jsonResponse(body, status), request, env);
  if (request.method === 'OPTIONS') return withCors(jsonResponse({ ok: true }), request, env);
  if (request.method !== 'POST') return respond({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  const origin = request.headers.get('origin');
  if (!origin || !isAllowedOrigin(origin, env)) {
    return respond({ ok: false, code: 'ORIGIN_NOT_ALLOWED' }, 403);
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

  const serviceRoleKey = readEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) return respond({ ok: false, code: 'INVITATION_SERVICE_UNAVAILABLE' }, 503);

  let input;
  try {
    input = await request.json();
  } catch {
    return respond({ ok: false, code: 'INVALID_JSON' }, 400);
  }
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return respond({ ok: false, code: 'INVALID_EMAIL' }, 422);
  }

  const memberUrl = new URL(`${identity.supabaseUrl}/rest/v1/organization_members`);
  memberUrl.search = new URLSearchParams({
    select: 'organization_id,role,is_active',
    user_id: `eq.${identity.user.id}`,
    limit: '1'
  }).toString();
  const memberResponse = await fetchImpl(memberUrl, {
    headers: { apikey: identity.anonKey, Authorization: identity.authorization }
  });
  if (!memberResponse.ok) return respond({ ok: false, code: 'MEMBERSHIP_LOOKUP_FAILED' }, 502);
  const memberships = await memberResponse.json();
  const member = Array.isArray(memberships) ? memberships[0] : null;
  if (!member || member.role !== 'org_admin' || !member.is_active) {
    return respond({ ok: false, code: 'ORGANIZATION_ADMIN_REQUIRED' }, 403);
  }

  const organizationUrl = new URL(`${identity.supabaseUrl}/rest/v1/organizations`);
  organizationUrl.search = new URLSearchParams({
    select: 'id,status,is_active',
    id: `eq.${member.organization_id}`,
    limit: '1'
  }).toString();
  const organizationResponse = await fetchImpl(organizationUrl, {
    headers: { apikey: identity.anonKey, Authorization: identity.authorization }
  });
  if (!organizationResponse.ok) return respond({ ok: false, code: 'ORGANIZATION_LOOKUP_FAILED' }, 502);
  const organizations = await organizationResponse.json();
  const organization = Array.isArray(organizations) ? organizations[0] : null;
  if (!organization || organization.status !== 'approved' || !organization.is_active) {
    return respond({ ok: false, code: 'ORGANIZATION_NOT_ACTIVE' }, 403);
  }

  const inviteUrl = new URL('/org-dashboard/', origin);
  inviteUrl.searchParams.set('page', 'invitation');
  const authUrl = new URL(`${identity.supabaseUrl}/auth/v1/invite`);
  authUrl.searchParams.set('redirect_to', inviteUrl.toString());
  const authResponse = await fetchImpl(authUrl, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email })
  });
  if (authResponse.status === 400 || authResponse.status === 422 || authResponse.status === 409) {
    return respond({ ok: false, code: 'EMAIL_ALREADY_REGISTERED' }, 409);
  }
  if (!authResponse.ok) return respond({ ok: false, code: 'AUTH_INVITATION_FAILED' }, 502);
  const invitedUser = await authResponse.json();
  if (typeof invitedUser?.id !== 'string') {
    return respond({ ok: false, code: 'AUTH_INVITATION_FAILED' }, 502);
  }

  const invitationResponse = await fetchImpl(`${identity.supabaseUrl}/rest/v1/organization_invitations`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      organization_id: organization.id,
      invited_user_id: invitedUser.id,
      email,
      invited_by: identity.user.id
    })
  });
  if (!invitationResponse.ok) {
    return respond({ ok: false, code: 'INVITATION_RECORD_FAILED' }, 502);
  }
  return respond({ ok: true, expires_in_days: 7 }, 201);
}
