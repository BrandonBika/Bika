import { authenticateBearer, AuthenticationError } from '../_shared/authenticate.js';
import { withCors } from '../_shared/cors.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function textField(value, field, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new TypeError(`${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw new TypeError(`${field} must be text.`);
  const normalized = value.trim();
  if (!normalized && required) throw new TypeError(`${field} is required.`);
  if (normalized.length > 120) throw new TypeError(`${field} is too long.`);
  return normalized || null;
}

export async function handleOrgsRegister(request, context = {}) {
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
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return respond({ ok: false, code: 'INVALID_REQUEST' }, 400);
  }

  let organization;
  try {
    organization = {
      name: textField(input.name, 'name', true),
      type: textField(input.type, 'type', true),
      jurisdiction_level: textField(input.jurisdiction_level, 'jurisdiction_level', true),
      province: textField(input.province, 'province'),
      municipality: textField(input.municipality, 'municipality'),
      submitted_by: identity.user.id
    };
  } catch (error) {
    if (error instanceof TypeError) {
      return respond({ ok: false, code: 'INVALID_REQUEST', message: error.message }, 422);
    }
    throw error;
  }

  const response = await fetchImpl(`${identity.supabaseUrl}/rest/v1/organizations?select=id,name,status`, {
    method: 'POST',
    headers: {
      apikey: identity.anonKey,
      Authorization: identity.authorization,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(organization)
  });

  if (response.status === 401 || response.status === 403) {
    return respond({ ok: false, code: 'REGISTRATION_NOT_ALLOWED' }, 403);
  }
  if (response.status === 409) {
    return respond({ ok: false, code: 'ORGANIZATION_CONFLICT' }, 409);
  }
  if (!response.ok) {
    return respond({ ok: false, code: 'REGISTRATION_FAILED' }, 502);
  }

  const rows = await response.json();
  const created = Array.isArray(rows) ? rows[0] : null;
  if (!created || created.status !== 'pending' || typeof created.id !== 'string') {
    return respond({ ok: false, code: 'REGISTRATION_FAILED' }, 502);
  }
  return respond({ ok: true, organization: created }, 201);
}