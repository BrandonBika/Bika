import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { handleReprocessReport } from './handler.js';

const serviceToken = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
const envValues = {
  ADMIN_TASK_SECRET: 'test-admin-secret',
  GEMINI_API_KEY: 'test-gemini-key',
  GEMINI_MODEL: 'configured-flash-model',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  SUPABASE_URL: 'https://gnwaaedtofazlkjkurea.supabase.co'
};
const result = {
  original_transcription: 'A street light is broken.',
  detected_language: 'en',
  english_translation: 'A street light is broken.',
  visual_evidence_summary: 'A street light is visible.',
  photo_matches_report: true,
  issue_category: 'Street lighting',
  urgency: 'MEDIUM',
  requires_immediate_dispatch: false,
  extracted_location: 'GPS location provided.',
  recommended_organization: {
    organization_name: 'Municipality Electricity Department',
    jurisdiction_level: 'municipal',
    reasoning: 'Repairs local street lights.'
  },
  alternative_organizations: [],
  classification_confidence: 0.9,
  routing_confidence: 0.85,
  needs_human_review: false,
  review_reason: ''
};

function createEnv(overrides = {}) {
  const values = { ...envValues, ...overrides };
  return { get: (name) => values[name] || '' };
}

function request({
  reports = ['CN-2026-000014'],
  role = 'service_role',
  secret = 'test-admin-secret'
} = {}) {
  const token = `header.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  return new Request('https://gnwaaedtofazlkjkurea.supabase.co/functions/v1/reprocess-report', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${role === 'service_role' ? serviceToken : token}`,
      'Content-Type': 'application/json',
      'x-admin-task-secret': secret
    },
    body: JSON.stringify({ reports })
  });
}

function requestWithoutJwt({ reports = ['CN-2026-000014'], secret = 'test-admin-secret' } = {}) {
  return new Request('https://gnwaaedtofazlkjkurea.supabase.co/functions/v1/reprocess-report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-task-secret': secret
    },
    body: JSON.stringify({ reports })
  });
}

test('authenticates with the admin task secret and returns a generic unauthorized response', async () => {
  const userResponse = await handleReprocessReport(requestWithoutJwt(), {
    env: createEnv(),
    fetchImpl: async (url) => String(url).endsWith('/rest/v1/rpc/consume_report_rate_limit')
      ? new Response(JSON.stringify({ allowed: true }), { status: 200 })
      : new Response('[]', { status: 200 })
  });
  const secretResponse = await handleReprocessReport(request({ secret: 'wrong-secret' }), {
    env: createEnv()
  });
  const missingSecretResponse = await handleReprocessReport(request({ secret: '' }), {
    env: createEnv()
  });
  assert.equal(userResponse.status, 200);
  assert.equal(secretResponse.status, 401);
  assert.deepEqual(await secretResponse.json(), await missingSecretResponse.json());
});

test('accepts no more than five explicit report identifiers', async () => {
  for (const reports of [[], ['CN-2026-000014', 'CN-2026-000015', 'CN-2026-000016', 'CN-2026-000017', 'CN-2026-000018', 'CN-2026-000019']]) {
    const response = await handleReprocessReport(requestWithoutJwt({ reports }), {
      env: createEnv()
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'INVALID_REPORTS');
  }
});

test('reprocesses only Needs Review reports with audio and records the result', async () => {
  const reportId = 'a6f0b740-cf62-4d0d-a139-0eb9a2b68532';
  const audioBytes = new Uint8Array([1, 2, 3, 4]);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ target, options });
    if (target.endsWith('/rest/v1/rpc/consume_report_rate_limit')) {
      return new Response(JSON.stringify({ allowed: true }), { status: 200 });
    }
    if (target.includes('/rest/v1/reports?select=')) {
      return new Response(JSON.stringify([{
        id: reportId,
        status: 'Needs Review',
        tracking_number: 'CN-2026-000014',
        report_level: 'MEDIUM',
        description_original: '',
        ai_category: 'Unclear report',
        urgency: 'MEDIUM',
        requires_immediate_dispatch: false,
        recommended_organization_text: 'Municipal dispatch desk',
        visual_evidence_summary: '',
        latitude: -29.85,
        longitude: 31.02,
        location_accuracy: 10,
        gps_status: 'gps'
      }]), { status: 200 });
    }
    if (target.includes('/rest/v1/report_evidence?')) {
      return new Response(JSON.stringify([{
        kind: 'audio',
        bucket: 'report-evidence',
        path: `${reportId}/audio.wav`,
        mime_type: 'audio/wav',
        duration_seconds: 2
      }]), { status: 200 });
    }
    if (target.includes('/storage/v1/object/authenticated/')) {
      return new Response(audioBytes, { status: 200 });
    }
    if (target.includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }]
      }), { status: 200 });
    }
    return new Response(target.includes('/rest/v1/reports?id=') ? null : '{}', {
      status: target.includes('/rest/v1/reports?id=') ? 204 : 201
    });
  };

  const response = await handleReprocessReport(requestWithoutJwt(), {
    env: createEnv(),
    fetchImpl
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.results[0].report.transcription, result.original_transcription);
  assert.equal(body.results[0].report.translation, result.english_translation);
  assert.equal(body.results[0].report.category, result.issue_category);
  assert.equal(body.results[0].report.urgency, result.urgency);
  assert.equal(body.results[0].report.recommended_organization, result.recommended_organization.organization_name);
  const gemini = calls.find(({ target }) => target.includes('generativelanguage.googleapis.com'));
  assert.match(gemini.target, /\/models\/configured-flash-model:generateContent/);
  const savedAiRun = JSON.parse(calls.find(({ target }) => target.endsWith('/rest/v1/ai_runs')).options.body);
  assert.equal(savedAiRun.model, 'configured-flash-model');
  assert.equal(savedAiRun.error, null);
  assert.deepEqual(
    calls.filter(({ target }) => target.endsWith('/rest/v1/rpc/log_report_event'))
      .map(({ options }) => JSON.parse(options.body).p_event_type),
    ['ai_classified', 'routed']
  );
});

test('rejects requests when the server-side admin rate limit is reached', async () => {
  let processingStarted = false;
  const fetchImpl = async (url) => {
    if (String(url).endsWith('/rest/v1/rpc/consume_report_rate_limit')) {
      return new Response(JSON.stringify({ allowed: false }), { status: 200 });
    }
    processingStarted = true;
    return new Response('{}', { status: 200 });
  };
  const response = await handleReprocessReport(requestWithoutJwt(), {
    env: createEnv(),
    fetchImpl
  });

  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'RATE_LIMITED');
  assert.equal(processingStarted, false);
});
