import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReportSubmit } from './handler.js';

const resident = {
  id: 'b8f2cd6b-8304-4e3e-b5ab-ddf26a2fd0ca',
  is_anonymous: false,
  app_metadata: { provider: 'email' }
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

function createRequest(payload, { photo = null } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    form.append(key, String(value));
  }
  if (photo) form.append('photo', photo, photo.type === 'image/png' ? 'issue.png' : 'issue.jpg');
  return new Request('https://staging.example.test/functions/v1/report-submit', {
    method: 'POST',
    body: form
  });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function createBackend({
  blockRateLimit = false,
  reportInsertFailure = null,
  storageDeleteStatus = 204
} = {}) {
  const calls = [];
  let savedReport = null;
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    const method = options.method || 'GET';
    calls.push({ url, method, options });

    if (url.includes('/rest/v1/reports?')) {
      return jsonResponse(savedReport ? [savedReport] : []);
    }
    if (url.endsWith('/rest/v1/rpc/consume_report_rate_limit')) {
      return jsonResponse({ allowed: !blockRateLimit });
    }
    if (url.includes('/storage/v1/object/report-evidence/')) {
      if (method === 'DELETE') return new Response(null, { status: storageDeleteStatus });
      return new Response(null, { status: 200 });
    }
    if (url.endsWith('/rest/v1/reports') && method === 'POST') {
      if (reportInsertFailure) {
        return jsonResponse(reportInsertFailure.body, reportInsertFailure.status);
      }
      const inputRow = JSON.parse(options.body);
      savedReport = {
        report_level: 'MEDIUM',
        ...inputRow,
        tracking_number: 'CN-2026-900001',
        created_at: '2026-10-12T10:00:00.000Z'
      };
      return jsonResponse([savedReport], 201);
    }
    if (url.endsWith('/rest/v1/report_evidence')) return new Response(null, { status: 201 });
    if (url.endsWith('/rest/v1/rpc/log_report_event')) return new Response(null, { status: 200 });
    throw new Error(`Unexpected backend request: ${method} ${url}`);
  };
  return { calls, fetchImpl, getSavedReport: () => savedReport };
}

function basePayload() {
  return {
    idempotency_key: 'resident-test-key-0001',
    category: 'roads_traffic',
    description: 'A damaged road surface at the corner.',
    address: '12 Example Road',
    organisation: 'Example Municipality',
    branch: 'Roads',
    source: 'whatsapp',
    reporter_id: 'client-controlled-id',
    reporter_type: 'guest',
    status: 'Resolved',
    report_level: 'CRITICAL',
    tracking_number: 'CN-FAKE-000001'
  };
}

test('creates a report_form report, stores evidence and ignores protected client fields', async () => {
  const backend = createBackend();
  const response = await handleReportSubmit(createRequest(basePayload(), {
    photo: new Blob(['test image bytes'], { type: 'image/jpeg' })
  }), {
    env: createEnv(),
    fetchImpl: backend.fetchImpl,
    user: resident
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.receipt.tracking_number, 'CN-2026-900001');
  assert.equal(result.receipt.status, 'Pending Dispatch');

  const saved = backend.getSavedReport();
  assert.equal(saved.reporter_id, resident.id);
  assert.equal(saved.reporter_type, 'resident');
  assert.equal(saved.source, 'report_form');
  assert.equal(saved.status, 'Pending Dispatch');
  assert.equal(saved.report_level, 'MEDIUM');
  assert.equal(saved.user_selected_category, 'roads_traffic');
  assert.equal(saved.user_selected_organization, 'Example Municipality');
  assert.equal(saved.user_selected_branch, 'Roads');
  assert.equal(saved.idempotency_key, 'resident-test-key-0001');
  assert.equal('tracking_number' in JSON.parse(
    backend.calls.find((call) => call.url.endsWith('/rest/v1/reports') && call.method === 'POST').options.body
  ), false);

  const uploaded = backend.calls.filter((call) => call.url.includes('/storage/v1/object/report-evidence/'));
  assert.equal(uploaded.length, 1);
  assert.match(uploaded[0].url, new RegExp(`/storage/v1/object/report-evidence/${resident.id}/${saved.id}/photo-`));
  const evidenceCall = backend.calls.find((call) => call.url.endsWith('/rest/v1/report_evidence'));
  assert.ok(evidenceCall);
  assert.match(evidenceCall.options.body, /"kind":"image"/);
  assert.equal(
    backend.calls.some((call) => call.url.endsWith('/rest/v1/rpc/log_report_event')),
    false
  );
});

test('accepts the resident form multipart payload with a pinned location and PNG photo', async () => {
  const backend = createBackend();
  const payload = {
    idempotency_key: 'resident-form-real-payload-01',
    category: 'water_sanitation',
    description: 'Water leak beside the road.',
    address: 'Pinned location',
    latitude: '-29.8587',
    longitude: '31.0218',
    organisation: 'eThekwini Municipality',
    branch: ''
  };
  const photo = new Blob([new Uint8Array(68)], { type: 'image/png' });
  const response = await handleReportSubmit(createRequest(payload, { photo }), {
    env: createEnv(),
    fetchImpl: backend.fetchImpl,
    user: resident
  });

  assert.equal(response.status, 200);
  const saved = backend.getSavedReport();
  assert.equal(saved.user_selected_category, 'water_sanitation');
  assert.equal(saved.user_reported_address, 'Pinned location');
  assert.equal(saved.latitude, -29.8587);
  assert.equal(saved.longitude, 31.0218);
  assert.deepEqual(saved.location, {
    type: 'Point',
    coordinates: [31.0218, -29.8587]
  });
  const upload = backend.calls.find((call) => call.url.includes('/storage/v1/object/report-evidence/'));
  assert.match(upload.url, /photo-[0-9a-f-]+\.png$/);
  assert.equal(upload.options.headers['Content-Type'], 'image/png');
  const evidenceCall = backend.calls.find((call) => call.url.endsWith('/rest/v1/report_evidence'));
  assert.match(evidenceCall.options.body, /"mime_type":"image\/png"/);
  assert.match(evidenceCall.options.body, /"size_bytes":68/);
});

test('preserves the report insert error code and cleanup status when cleanup fails', async () => {
  const backend = createBackend({
    reportInsertFailure: {
      status: 400,
      body: { code: '22P02', message: 'database detail must not be returned' }
    },
    storageDeleteStatus: 403
  });
  const errors = [];
  const originalConsoleError = console.error;
  console.error = (...args) => errors.push(args);
  let response;
  try {
    response = await handleReportSubmit(createRequest({
      idempotency_key: 'resident-cleanup-failure-01',
      category: 'roads_traffic',
      description: 'Marked diagnostic report description.',
      address: 'Pinned location',
      latitude: '-29.8587',
      longitude: '31.0218'
    }, {
      photo: new Blob([new Uint8Array(68)], { type: 'image/png' })
    }), {
      env: createEnv(),
      fetchImpl: backend.fetchImpl,
      user: resident
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(response.status, 500);
  const result = await response.json();
  assert.equal(result.code, '22P02');
  assert.equal(result.original_error_code, '22P02');
  assert.equal(result.cleanup_status, 'incomplete');
  assert.match(result.message, /evidence cleanup is incomplete/);
  assert.doesNotMatch(JSON.stringify(result), /database detail|Marked diagnostic/);
  assert.match(JSON.stringify(errors), /22P02/);
  assert.doesNotMatch(JSON.stringify(errors), /service-test-key|test-only-hmac-secret|Marked diagnostic/);
});

test('retry with the same idempotency key returns the saved report without another insert', async () => {
  const backend = createBackend();
  const context = { env: createEnv(), fetchImpl: backend.fetchImpl, user: resident };
  const first = await handleReportSubmit(createRequest(basePayload()), context);
  const retry = await handleReportSubmit(createRequest(basePayload()), context);

  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).idempotent_replay, true);
  assert.equal(backend.calls.filter((call) => call.url.endsWith('/rest/v1/reports') && call.method === 'POST').length, 1);
  assert.equal(backend.calls.filter((call) => call.url.endsWith('/rest/v1/rpc/consume_report_rate_limit')).length, 2);
});

test('rejects a guest token on the resident submission endpoint', async () => {
  const backend = createBackend();
  const response = await handleReportSubmit(createRequest(basePayload()), {
    env: createEnv(),
    fetchImpl: backend.fetchImpl,
    user: { ...resident, is_anonymous: true, app_metadata: { provider: 'anonymous' } }
  });

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'ACCOUNT_TYPE_MISMATCH');
});

test('rate limit prevents report creation', async () => {
  const backend = createBackend({ blockRateLimit: true });
  const response = await handleReportSubmit(createRequest(basePayload()), {
    env: createEnv(),
    fetchImpl: backend.fetchImpl,
    user: resident
  });

  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'REPORT_RATE_LIMITED');
  assert.equal(backend.calls.some((call) => call.url.endsWith('/rest/v1/reports') && call.method === 'POST'), false);
});
