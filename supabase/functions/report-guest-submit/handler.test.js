import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReportGuestSubmit } from './handler.js';

const guest = {
  id: 'cda8dbcf-7c7c-4333-9cff-3e8a4ba639e8',
  is_anonymous: true,
  app_metadata: { provider: 'anonymous' }
};

function createEnv() {
  const values = {
    SUPABASE_URL: 'https://staging.example.test',
    SUPABASE_ANON_KEY: 'public-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test-key',
    GUEST_LOOKUP_HMAC_KEY: 'test-only-hmac-secret'
  };
  return { get: (name) => values[name] || '' };
}

function createRequest(payload) {
  return new Request('https://staging.example.test/functions/v1/report-guest-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createBackend({ limitedScope = null, organizationApproved = true } = {}) {
  const calls = [];
  let savedReport = null;
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    const method = options.method || 'GET';
    calls.push({ url, method, options });

    if (url.includes('/rest/v1/reports?')) {
      return jsonResponse(savedReport ? [savedReport] : []);
    }
    if (url.endsWith('/rest/v1/rpc/organization_name_is_approved')) {
      return jsonResponse(organizationApproved);
    }
    if (url.endsWith('/rest/v1/rpc/consume_report_rate_limit')) {
      const { p_scope } = JSON.parse(options.body);
      return jsonResponse({ allowed: p_scope !== limitedScope });
    }
    if (url.endsWith('/rest/v1/reports') && method === 'POST') {
      const inputRow = JSON.parse(options.body);
      savedReport = {
        report_level: 'MEDIUM',
        ...inputRow,
        tracking_number: 'CN-2026-900002',
        created_at: '2026-10-12T11:00:00.000Z'
      };
      return jsonResponse([savedReport], 201);
    }
    if (url.endsWith('/rest/v1/guest_report_lookup_secrets')) {
      return new Response(null, { status: 201 });
    }
    if (url.endsWith('/rest/v1/guest_contacts')) {
      return new Response(null, { status: 201 });
    }
    if (url.endsWith('/rest/v1/rpc/log_report_event')) {
      return new Response(null, { status: 200 });
    }
    throw new Error(`Unexpected backend request: ${method} ${url}`);
  };
  return { calls, fetchImpl, getSavedReport: () => savedReport };
}

function basePayload() {
  return {
    idempotency_key: 'guest-test-key-00001',
    category: 'water_sanitation',
    description: 'Water leaking from a street connection.',
    address: '4 Sample Street',
    organisation: 'Example Municipality',
    branch: 'Water',
    source: 'report_form',
    reporter_id: 'client-controlled-id',
    reporter_type: 'resident',
    status: 'Resolved',
    report_level: 'CRITICAL',
    tracking_number: 'CN-FAKE-000002'
  };
}

test('creates a guest_report with a one-time lookup code and hides identity', async () => {
  const backend = createBackend();
  const response = await handleReportGuestSubmit(createRequest(basePayload()), {
    env: createEnv(),
    fetchImpl: backend.fetchImpl,
    user: guest
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.receipt.tracking_number, 'CN-2026-900002');
  assert.equal(result.receipt.status, 'Pending Dispatch');
  assert.match(result.receipt.lookup_code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
  assert.equal('reporter_id' in result.receipt, false);
  assert.equal('phone' in result.receipt, false);
  assert.equal('latitude' in result.receipt, false);

  const saved = backend.getSavedReport();
  assert.equal(saved.reporter_id, guest.id);
  assert.equal(saved.reporter_type, 'guest');
  assert.equal(saved.source, 'guest_report');
  assert.equal(saved.status, 'Pending Dispatch');
  assert.equal(saved.report_level, 'MEDIUM');
  assert.equal(saved.user_selected_category, 'water_sanitation');

  const secretCall = backend.calls.find((call) => call.url.endsWith('/rest/v1/guest_report_lookup_secrets'));
  assert.ok(secretCall);
  const secretRow = JSON.parse(secretCall.options.body);
  assert.equal(secretRow.report_id, saved.id);
  assert.match(secretRow.lookup_code_hash, /^[0-9a-f]{64}$/);
  assert.equal(secretCall.options.body.includes(result.receipt.lookup_code), false);

  const scopes = backend.calls
    .filter((call) => call.url.endsWith('/rest/v1/rpc/consume_report_rate_limit'))
    .map((call) => JSON.parse(call.options.body));
  assert.deepEqual(scopes.map(({ p_scope, p_request_limit, p_window_seconds }) => [
    p_scope, p_request_limit, p_window_seconds
  ]), [
    ['guest-user-15m', 3, 900],
    ['guest-ip-15m', 10, 900],
    ['guest-user-daily', 5, 86400]
  ]);
});

test('stores optional guest contact only with explicit consent', async () => {
  const backend = createBackend();
  const payload = {
    ...basePayload(),
    guest_contact: '082 123 4567',
    contact_preference: 'sms',
    consent_to_updates: true
  };
  const response = await handleReportGuestSubmit(createRequest(payload), {
    env: createEnv(),
    fetchImpl: backend.fetchImpl,
    user: guest
  });

  test('does not create a guest report for an unapproved selected organization', async () => {
    const backend = createBackend({ organizationApproved: false });
    const response = await handleReportGuestSubmit(createRequest(basePayload()), {
      env: createEnv(),
      fetchImpl: backend.fetchImpl,
      user: guest
    });

    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'ORGANIZATION_NOT_APPROVED');
    assert.equal(backend.getSavedReport(), null);
  });

  assert.equal(response.status, 200);
  const contactCall = backend.calls.find((call) => call.url.endsWith('/rest/v1/guest_contacts'));
  assert.ok(contactCall);
  const contact = JSON.parse(contactCall.options.body);
  assert.equal(contact.reporter_id, guest.id);
  assert.equal(contact.phone, '082 123 4567');
  assert.equal(contact.email, null);
  assert.equal(contact.consent_to_updates, true);
});

test('does not accept a resident token on the guest endpoint', async () => {
  const backend = createBackend();
  const response = await handleReportGuestSubmit(createRequest(basePayload()), {
    env: createEnv(),
    fetchImpl: backend.fetchImpl,
    user: { ...guest, is_anonymous: false, app_metadata: { provider: 'email' } }
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'ACCOUNT_TYPE_MISMATCH');
});

test('requires consent before storing guest contact details', async () => {
  const backend = createBackend();
  const response = await handleReportGuestSubmit(createRequest({
    ...basePayload(),
    guest_contact: '082 123 4567',
    contact_preference: 'sms'
  }), {
    env: createEnv(),
    fetchImpl: backend.fetchImpl,
    user: guest
  });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'CONTACT_CONSENT_REQUIRED');
  assert.equal(backend.calls.length, 0);
});

test('retry returns the same tracking code and does not create another report', async () => {
  const backend = createBackend();
  const context = { env: createEnv(), fetchImpl: backend.fetchImpl, user: guest };
  const first = await handleReportGuestSubmit(createRequest(basePayload()), context);
  const retry = await handleReportGuestSubmit(createRequest(basePayload()), context);
  const firstBody = await first.json();
  const retryBody = await retry.json();

  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(retryBody.idempotent_replay, true);
  assert.equal(retryBody.receipt.lookup_code, firstBody.receipt.lookup_code);
  assert.equal(backend.calls.filter((call) => call.url.endsWith('/rest/v1/reports') && call.method === 'POST').length, 1);
});

test('applies the guest user rate limit before writing a report', async () => {
  const backend = createBackend({ limitedScope: 'guest-user-15m' });
  const response = await handleReportGuestSubmit(createRequest(basePayload()), {
    env: createEnv(),
    fetchImpl: backend.fetchImpl,
    user: guest
  });

  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'REPORT_RATE_LIMITED');
  assert.equal(backend.calls.some((call) => call.url.endsWith('/rest/v1/reports') && call.method === 'POST'), false);
});
