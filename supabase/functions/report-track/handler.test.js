import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { handleReportTrack } from './handler.js';

const secret = 'test-only-hmac-secret';
const user = { id: 'b8f2cd6b-8304-4e3e-b5ab-ddf26a2fd0ca' };
const report = {
  id: 'e71fd2c0-0b4d-4e75-957a-f0b0817a5c3a',
  tracking_number: 'CN-2026-900001',
  status: 'Needs Review',
  report_level: 'MEDIUM',
  ai_category: null,
  user_selected_category: 'roads_traffic',
  category: 'roads_traffic',
  created_at: '2026-10-12T10:00:00.000Z',
  updated_at: '2026-10-12T10:00:00.000Z',
  resolved_at: null
};

async function hmac(value) {
  const key = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return [...new Uint8Array(await webcrypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  ))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createEnv() {
  const values = {
    SUPABASE_URL: 'https://staging.example.test',
    SUPABASE_ANON_KEY: 'public-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
    GUEST_LOOKUP_HMAC_KEY: secret,
    HCAPTCHA_SECRET: 'test-only-captcha-secret'
  };
  return { get: (name) => values[name] || '' };
}

function createRequest(payload = {}) {
  return new Request('https://staging.example.test/functions/v1/report-track', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-user-token',
      'Content-Type': 'application/json',
      'X-Forwarded-For': '203.0.113.10, 198.51.100.5'
    },
    body: JSON.stringify({
      tracking_number: report.tracking_number,
      lookup_code: '23456789AB',
      ...payload
    })
  });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function createBackend({
  reportFound = true,
  lockedUntil = null,
  reportCounter = null,
  ipCounter = null,
  captchaPass = true
} = {}) {
  const calls = [];
  const validHash = await hmac('guest-report-lookup:23456789AB');
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method || 'GET';
    calls.push({ url, method, options });

    if (url.pathname === '/auth/v1/user') return jsonResponse(user);
    if (url.pathname === '/rest/v1/reports') return jsonResponse(reportFound ? [report] : []);
    if (url.pathname === '/rest/v1/guest_report_lookup_attempts') {
      return jsonResponse(lockedUntil ? [{ locked_until: lockedUntil }] : []);
    }
    if (url.pathname === '/rest/v1/guest_report_lookup_report_counters') {
      return jsonResponse(reportCounter ? [reportCounter] : []);
    }
    if (url.pathname === '/rest/v1/guest_report_lookup_ip_counters') {
      return jsonResponse(ipCounter ? [ipCounter] : []);
    }
    if (url.pathname === '/rest/v1/guest_report_lookup_secrets') {
      return jsonResponse([{ lookup_code_hash: validHash }]);
    }
    if (url.pathname === '/rest/v1/rpc/record_guest_lookup_ip_failure') {
      return jsonResponse({ ip_failure_count: 1 });
    }
    if (url.pathname === '/rest/v1/rpc/record_guest_lookup_failure_for_requester') {
      return jsonResponse({ report_failure_count: 1 });
    }
    if (url.pathname === '/rest/v1/rpc/clear_guest_lookup_attempt_on_success') {
      return new Response(null, { status: 204 });
    }
    if (url.hostname === 'hcaptcha.com') {
      return jsonResponse({ success: captchaPass });
    }
    throw new Error(`Unexpected backend request: ${method} ${url.pathname}`);
  };
  return { calls, fetchImpl };
}

async function invoke(payload, options, envOverrides = {}) {
  const backend = await createBackend(options);
  const response = await handleReportTrack(createRequest(payload), {
    env: { get: (name) => Object.hasOwn(envOverrides, name) ? envOverrides[name] : createEnv().get(name) },
    fetchImpl: backend.fetchImpl
  });
  return { response, backend };
}

test('returns only approved report tracking fields and clears attempts on success', async () => {
  const { response, backend } = await invoke();

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), [
    'category', 'created_at', 'level', 'resolved_at', 'status', 'tracking_number', 'updated_at'
  ]);
  assert.equal(body.tracking_number, report.tracking_number);
  assert.equal(body.level, 'MEDIUM');
  assert.equal(body.category, 'roads_traffic');
  assert.equal('reporter_id' in body, false);
  assert.equal('location_lat' in body, false);
  assert.equal(backend.calls.some(({ url }) => url.pathname.endsWith('/clear_guest_lookup_attempt_on_success')), true);
});

test('uses the same generic failure for a wrong code', async () => {
  const { response, backend } = await invoke({ lookup_code: '23456789AC' });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Unable to retrieve report details.' });
  assert.equal(backend.calls.some(({ url }) => url.pathname.endsWith('/record_guest_lookup_failure_for_requester')), true);
  assert.equal(backend.calls.some(({ url }) => url.pathname.endsWith('/clear_guest_lookup_attempt_on_success')), false);
});

test('records unknown tracking numbers without revealing whether they exist', async () => {
  const { response, backend } = await invoke(
    { tracking_number: 'CN-2026-900002' },
    { reportFound: false }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Unable to retrieve report details.' });
  assert.equal(backend.calls.some(({ url }) => url.pathname.endsWith('/record_guest_lookup_ip_failure')), true);
});

test('enforces a live requester lock with the same generic failure', async () => {
  const { response, backend } = await invoke({}, {
    lockedUntil: new Date(Date.now() + 60_000).toISOString()
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Unable to retrieve report details.' });
  assert.equal(backend.calls.some(({ url }) => url.pathname.endsWith('/guest_report_lookup_secrets')), false);
});

test('requires CAPTCHA only for a live 15-minute counter window', async () => {
  const active = {
    captcha_required: true,
    slow_down_until: null,
    window_started_at: new Date(Date.now() - 60_000).toISOString()
  };
  const blocked = await invoke({}, { reportCounter: active });
  assert.equal(blocked.response.status, 400);
  assert.equal(blocked.backend.calls.some(({ url }) => url.hostname === 'hcaptcha.com'), false);

  const verified = await invoke({ captcha_token: 'verified-test-token' }, {
    reportCounter: active,
    captchaPass: true
  });
  assert.equal(verified.response.status, 200);
  assert.equal(verified.backend.calls.some(({ url }) => url.hostname === 'hcaptcha.com'), true);
});

test('fails closed with the generic error when required CAPTCHA is unconfigured or rejected', async () => {
  const active = {
    captcha_required: true,
    slow_down_until: null,
    window_started_at: new Date(Date.now() - 60_000).toISOString()
  };
  const missingSecret = await invoke(
    { captcha_token: 'captcha-test-token' },
    { reportCounter: active },
    { HCAPTCHA_SECRET: '' }
  );
  assert.equal(missingSecret.response.status, 400);
  assert.deepEqual(await missingSecret.response.json(), { error: 'Unable to retrieve report details.' });
  assert.equal(missingSecret.backend.calls.some(({ url }) => url.hostname === 'hcaptcha.com'), false);
  assert.equal(missingSecret.backend.calls.some(({ url }) => url.pathname.endsWith('/guest_report_lookup_secrets')), false);

  const rejected = await invoke(
    { captcha_token: 'captcha-test-token' },
    { reportCounter: active, captchaPass: false }
  );
  assert.equal(rejected.response.status, 400);
  assert.deepEqual(await rejected.response.json(), { error: 'Unable to retrieve report details.' });
  assert.equal(rejected.backend.calls.some(({ url }) => url.hostname === 'hcaptcha.com'), true);
  assert.equal(rejected.backend.calls.some(({ url }) => url.pathname.endsWith('/guest_report_lookup_secrets')), false);
});

test('does not hard-block on IP slow-down and ignores expired CAPTCHA windows', async () => {
  const expiredWindow = {
    captcha_required: true,
    slow_down_until: new Date(Date.now() + 60_000).toISOString(),
    window_started_at: new Date(Date.now() - 16 * 60_000).toISOString()
  };
  const { response, backend } = await invoke({}, {
    ipCounter: expiredWindow,
    reportCounter: expiredWindow
  });

  assert.equal(response.status, 200);
  assert.equal(backend.calls.some(({ url }) => url.hostname === 'hcaptcha.com'), false);
});

test('answers preflight requests with CORS headers', async () => {
  const response = await handleReportTrack(new Request(
    'https://staging.example.test/functions/v1/report-track',
    { method: 'OPTIONS' }
  ));

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
});
