const GENERIC_FAILURE = Object.freeze({
  error: 'Unable to retrieve report details.'
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function response(body, status = 200) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json'
    }
  });
}

function encodeHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return encodeHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

function hashesMatch(expected, actual) {
  if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected) ||
      typeof actual !== 'string' || actual.length !== expected.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return difference === 0;
}

function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = request.headers.get('cf-connecting-ip') ||
    (forwarded ? forwarded.split(',')[0].trim() : '');
  return ip || 'unknown';
}

function activeWindow(row, now) {
  const startedAt = Date.parse(row?.window_started_at || '');
  return Number.isFinite(startedAt) &&
    startedAt <= now &&
    now - startedAt < 15 * 60 * 1000;
}

async function requestJson(url, serviceRole, fetchImpl, options = {}) {
  const result = await fetchImpl(url, {
    ...options,
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      ...(options.headers || {})
    }
  });
  if (!result.ok) throw new Error('Backend request failed.');
  const text = await result.text();
  return text ? JSON.parse(text) : null;
}

async function recordUnknownIpFailure(config, ipHash, fetchImpl) {
  await requestJson(`${config.url}/rest/v1/rpc/record_guest_lookup_ip_failure`, config.serviceRole, fetchImpl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_ip_key_hash: ipHash })
  });
}

async function recordLookupFailure(config, reportId, requesterHash, ipHash, fetchImpl) {
  await requestJson(`${config.url}/rest/v1/rpc/record_guest_lookup_failure_for_requester`, config.serviceRole, fetchImpl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_report_id: reportId,
      p_requester_key_hash: requesterHash,
      p_ip_key_hash: ipHash
    })
  });
}

async function verifyCaptcha(token, secret, fetchImpl) {
  if (!token || !secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  const result = await fetchImpl('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!result.ok) return false;
  try {
    const payload = await result.json();
    return payload.success === true;
  } catch {
    return false;
  }
}

function queryUrl(base, table, params) {
  const query = new URLSearchParams(params);
  return `${base}/rest/v1/${table}?${query.toString()}`;
}

export async function handleReportTracking(request, context = {}) {
  if (request.method === 'OPTIONS') return response(null, 204);
  if (request.method !== 'POST') return response(GENERIC_FAILURE, 400);

  const env = context.env || { get: () => '' };
  const fetchImpl = context.fetchImpl || fetch;
  const url = env.get('SUPABASE_URL');
  const anonKey = env.get('SUPABASE_ANON_KEY');
  const serviceRole = env.get('SUPABASE_SERVICE_ROLE_KEY');
  const hmacKey = env.get('GUEST_LOOKUP_HMAC_KEY');
  if (!url || !anonKey || !serviceRole || !hmacKey) {
    console.error('report-track is missing required service configuration');
    return response(GENERIC_FAILURE, 400);
  }

  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return response(GENERIC_FAILURE, 400);

    const payloadText = await request.text();
    if (payloadText.length > 8192) return response(GENERIC_FAILURE, 400);
    const payload = JSON.parse(payloadText);
    const trackingNumber = typeof payload.tracking_number === 'string'
      ? payload.tracking_number.trim().toUpperCase()
      : '';
    const lookupCode = typeof payload.lookup_code === 'string'
      ? payload.lookup_code.trim().toUpperCase()
      : '';
    const captchaToken = typeof payload.captcha_token === 'string' ? payload.captcha_token : '';
    if (!/^CN-\d{4}-\d{6}$/.test(trackingNumber) ||
        !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8,32}$/.test(lookupCode)) {
      return response(GENERIC_FAILURE, 400);
    }

    const authResponse = await fetchImpl(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization }
    });
    if (!authResponse.ok) return response(GENERIC_FAILURE, 400);
    const user = await authResponse.json();
    if (!user?.id) return response(GENERIC_FAILURE, 400);

    const requesterHash = await hmac(hmacKey, `guest-report-requester:${user.id}`);
    const ipHash = await hmac(hmacKey, `guest-report-ip:${getClientIp(request)}`);
    const reports = await requestJson(queryUrl(url, 'reports', {
      select: 'id,status,report_level,ai_category,user_selected_category,category,tracking_number,created_at,updated_at,resolved_at',
      tracking_number: `eq.${trackingNumber}`,
      reporter_type: 'eq.guest',
      limit: '1'
    }), serviceRole, fetchImpl);
    const report = Array.isArray(reports) ? reports[0] : null;
    if (!report) {
      await recordUnknownIpFailure({ url, serviceRole }, ipHash, fetchImpl);
      return response(GENERIC_FAILURE, 400);
    }

    const attempts = await requestJson(queryUrl(url, 'guest_report_lookup_attempts', {
      select: 'locked_until',
      report_id: `eq.${report.id}`,
      requester_key_hash: `eq.${requesterHash}`,
      limit: '1'
    }), serviceRole, fetchImpl);
    const lockUntil = Date.parse(attempts?.[0]?.locked_until || '');
    if (Number.isFinite(lockUntil) && lockUntil > Date.now()) {
      return response(GENERIC_FAILURE, 400);
    }

    const [reportCounters, ipCounters] = await Promise.all([
      requestJson(queryUrl(url, 'guest_report_lookup_report_counters', {
        select: 'captcha_required,slow_down_until,window_started_at',
        report_id: `eq.${report.id}`,
        limit: '1'
      }), serviceRole, fetchImpl),
      requestJson(queryUrl(url, 'guest_report_lookup_ip_counters', {
        select: 'captcha_required,slow_down_until,window_started_at',
        ip_key_hash: `eq.${ipHash}`,
        limit: '1'
      }), serviceRole, fetchImpl)
    ]);
    const now = Date.now();
    const reportWindowActive = activeWindow(reportCounters?.[0], now);
    const ipWindowActive = activeWindow(ipCounters?.[0], now);
    const reportSlowDown = Date.parse(reportCounters?.[0]?.slow_down_until || '');
    if (reportWindowActive && Number.isFinite(reportSlowDown) && reportSlowDown > now) {
      return response(GENERIC_FAILURE, 400);
    }

    const captchaRequired =
      (reportWindowActive && reportCounters?.[0]?.captcha_required === true) ||
      (ipWindowActive && ipCounters?.[0]?.captcha_required === true);
    if (captchaRequired && !await verifyCaptcha(captchaToken, env.get('HCAPTCHA_SECRET'), fetchImpl)) {
      await recordLookupFailure({ url, serviceRole }, report.id, requesterHash, ipHash, fetchImpl);
      return response(GENERIC_FAILURE, 400);
    }

    const secrets = await requestJson(queryUrl(url, 'guest_report_lookup_secrets', {
      select: 'lookup_code_hash',
      report_id: `eq.${report.id}`,
      limit: '1'
    }), serviceRole, fetchImpl);
    const actualHash = await hmac(hmacKey, `guest-report-lookup:${lookupCode}`);
    if (!secrets?.[0] || !hashesMatch(secrets[0].lookup_code_hash, actualHash)) {
      await recordLookupFailure({ url, serviceRole }, report.id, requesterHash, ipHash, fetchImpl);
      return response(GENERIC_FAILURE, 400);
    }

    await requestJson(`${url}/rest/v1/rpc/clear_guest_lookup_attempt_on_success`, serviceRole, fetchImpl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_report_id: report.id,
        p_requester_key_hash: requesterHash
      })
    });

    return response({
      tracking_number: report.tracking_number,
      status: report.status,
      level: report.report_level,
      category: report.ai_category || report.user_selected_category || report.category,
      created_at: report.created_at,
      updated_at: report.updated_at,
      resolved_at: report.resolved_at
    });
  } catch {
    console.error('report-track request failed');
    return response(GENERIC_FAILURE, 400);
  }
}
