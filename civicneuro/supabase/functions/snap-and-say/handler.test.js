import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeGeminiResult, GEMINI_MODEL, handleSnapAndSay } from './handler.js';

function createEnv(values = {}) {
  const defaults = {
    GEMINI_API_KEY: 'test-gemini-key',
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-key'
  };
  return { get: (name) => Object.hasOwn(values, name) ? values[name] : defaults[name] || '' };
}

function createAudioBlob(type = 'audio/wav', length = 2048) {
  return new Blob([new Uint8Array(length)], { type });
}

function createImageBlob(type = 'image/jpeg') {
  return new Blob(['fake-image-data'], { type });
}

function createRequest({
  audioType = 'audio/wav',
  audioLength = 2048,
  durationSeconds = 2,
  imageType = 'image/jpeg',
  latitude = -29.85,
  longitude = 31.02,
  accuracy = 15,
  includesImage = true,
  withGps = true,
  authorization = '',
  extraFormData = {}
} = {}) {
  const form = new FormData();
  form.append('audio', createAudioBlob(audioType, audioLength), 'sample.wav');
  form.append('duration_seconds', String(durationSeconds));
  if (includesImage) {
    form.append('image', createImageBlob(imageType), 'photo.jpg');
  }
  if (withGps) {
    form.append('latitude', String(latitude));
    form.append('longitude', String(longitude));
    form.append('location_accuracy', String(accuracy));
  }
  form.append('device_timestamp', new Date().toISOString());
  Object.entries(extraFormData).forEach(([key, value]) => form.append(key, String(value)));
  return new Request('https://example.test/functions/v1/snap-and-say', {
    method: 'POST',
    headers: authorization ? { Authorization: authorization } : {},
    body: form
  });
}

function testContext(fetchImpl) {
  return { env: createEnv(), fetchImpl, resolveUserId: async () => 'd1c82fc5-5ff2-4a79-a83c-829ba872e1f6' };
}

function createGeminiFetch(geminiJson) {
  return async (url) => {
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify(geminiJson) }]
          }
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).includes('/rest/v1/reports')) {
      return new Response(JSON.stringify([{ id: 'report-test-id', tracking_number: 'CN-2026-000123' }]), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

test('keeps low-confidence Gemini classifications in Needs Review', () => {
  const result = finalizeGeminiResult({ gps_status: 'gps' }, {
    original_transcription: 'There is a damaged street light.',
    detected_language: 'en',
    english_translation: 'There is a damaged street light.',
    visual_evidence_summary: 'A street light is visible.',
    photo_matches_report: true,
    issue_category: 'Street lighting',
    urgency: 'MEDIUM',
    requires_immediate_dispatch: false,
    recommended_organization: { organization_name: 'Municipal Electricity Department' },
    alternative_organizations: [],
    classification_confidence: 0.3,
    routing_confidence: 0.9,
    needs_human_review: false,
    review_reason: ''
  });
  assert.equal(result.status, 'Needs Review');
});

test('rejects recordings under one second', async () => {
  const response = await handleSnapAndSay(createRequest({ durationSeconds: 0.8 }), testContext(createGeminiFetch({
      original_transcription: 'hello',
      detected_language: 'en',
      english_translation: 'hello',
      visual_evidence_summary: 'clear photo',
      photo_matches_report: true,
      issue_category: 'Water leak',
      urgency: 'MEDIUM',
      requires_immediate_dispatch: false,
      extracted_location: 'near the clinic',
      recommended_organization: { organization_name: 'eThekwini Municipality', jurisdiction_level: 'municipal', reasoning: 'Local service team' },
      alternative_organizations: ['City of Durban'],
      classification_confidence: 0.82,
      routing_confidence: 0.76,
      needs_human_review: false,
      review_reason: ''
    })));

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.match(body.message, /Hold the button and speak/i);
});

test('rejects unsupported audio mime types', async () => {
  const response = await handleSnapAndSay(createRequest({ audioType: 'application/octet-stream' }), testContext(createGeminiFetch({
      original_transcription: 'hello',
      detected_language: 'en',
      english_translation: 'hello',
      visual_evidence_summary: 'clear photo',
      photo_matches_report: true,
      issue_category: 'Water leak',
      urgency: 'MEDIUM',
      requires_immediate_dispatch: false,
      extracted_location: 'near the clinic',
      recommended_organization: { organization_name: 'eThekwini Municipality', jurisdiction_level: 'municipal', reasoning: 'Local service team' },
      alternative_organizations: [],
      classification_confidence: 0.82,
      routing_confidence: 0.76,
      needs_human_review: false,
      review_reason: ''
    })));

  assert.equal(response.status, 415);
  const body = await response.json();
  assert.equal(body.code, 'UNSUPPORTED_AUDIO_MIME');
});

test('falls back to manual review when Gemini output is malformed', async () => {
  let attempts = 0;
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('generativelanguage.googleapis.com')) {
      attempts += 1;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: attempts === 1 ? 'not-json' : 'still-not-json' }] } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).includes('/rest/v1/reports')) {
      return new Response(JSON.stringify([{ id: 'report-test-id' }]), { status: 201 });
    }
    return new Response('{}', { status: 200 });
  };
  const response = await handleSnapAndSay(createRequest({}), testContext(fetchImpl));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.processing, true);
  assert.equal(body.report.status, 'Needs Review');
  assert.match(body.report.review_reason, /being processed/i);
  assert.equal(attempts, 1);
  assert.equal(calls.filter((url) => url.includes('/storage/v1/object/report-evidence/')).length, 2);
  assert.equal(calls.filter((url) => url.endsWith('/rest/v1/reports')).length, 1);
  assert.equal(calls.filter((url) => url.endsWith('/rest/v1/report_evidence')).length, 2);
  assert.equal(calls.filter((url) => url.endsWith('/rest/v1/ai_runs')).length, 1);
  assert.equal(calls.filter((url) => url.endsWith('/rest/v1/rpc/log_report_event')).length, 1);
});

test('accepts codec-suffixed webm and audio/mp4 media types', async () => {
  const validResult = {
    original_transcription: 'There is a damaged road.',
    detected_language: 'en',
    english_translation: 'There is a damaged road.',
    visual_evidence_summary: 'A damaged road is visible.',
    photo_matches_report: true,
    issue_category: 'Road damage',
    urgency: 'LOW',
    requires_immediate_dispatch: false,
    extracted_location: 'GPS location provided.',
    recommended_organization: { organization_name: 'Municipality Roads Department', jurisdiction_level: 'municipal', reasoning: 'Local road maintenance.' },
    alternative_organizations: [],
    classification_confidence: 0.9,
    routing_confidence: 0.9,
    needs_human_review: false,
    review_reason: ''
  };
  for (const audioType of ['audio/webm;codecs=opus', 'audio/mp4']) {
    const calls = [];
    const fetchGemini = createGeminiFetch(validResult);
    const response = await handleSnapAndSay(createRequest({ audioType }), {
      ...testContext(async (url, options) => {
        calls.push({ url: String(url), options });
        return fetchGemini(url, options);
      })
    });
    assert.equal(response.status, 200, audioType);
    const body = await response.json();
    assert.equal(body.report.evidence[0].bucket, 'report-evidence');
    assert.match(body.report.evidence[0].path, /^[0-9a-f-]+\/[0-9a-f-]+\/audio-/);
    const geminiCall = calls.find(({ url }) => url.includes('generativelanguage.googleapis.com'));
    assert.ok(geminiCall.url.includes(`/models/${GEMINI_MODEL}:generateContent`));
    const request = JSON.parse(geminiCall.options.body);
    assert.equal(request.generationConfig.responseMimeType, 'application/json');
    assert.equal(request.contents[0].parts.find(({ inline_data }) => inline_data?.mime_type?.startsWith('audio/'))?.inline_data.mime_type,
      audioType.startsWith('audio/webm') ? 'audio/webm' : 'audio/m4a');
  }
});

test('uploads private evidence to the report path and persists evidence metadata', async () => {
  const residentId = 'd1c82fc5-5ff2-4a79-a83c-829ba872e1f6';
  const calls = [];
  const validResult = {
    original_transcription: 'A road is damaged.',
    detected_language: 'en',
    english_translation: 'A road is damaged.',
    visual_evidence_summary: 'Road damage is visible.',
    photo_matches_report: true,
    issue_category: 'Road damage',
    urgency: 'LOW',
    requires_immediate_dispatch: false,
    extracted_location: 'GPS location provided.',
    recommended_organization: { organization_name: 'Municipality Roads Department', jurisdiction_level: 'municipal', reasoning: 'Local road maintenance.' },
    alternative_organizations: [],
    classification_confidence: 0.9,
    routing_confidence: 0.9,
    needs_human_review: false,
    review_reason: ''
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: residentId }), { status: 200 });
    }
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(validResult) }] } }]
      }), { status: 200 });
    }
    if (String(url).includes('/rest/v1/reports')) {
      return new Response(JSON.stringify([{ id: JSON.parse(options.body).id, tracking_number: 'CN-2026-000123' }]), { status: 201 });
    }
    return new Response('{}', { status: 200 });
  };
  const request = createRequest({ authorization: 'Bearer resident-session' });
  const response = await handleSnapAndSay(request, {
    env: createEnv({ GEMINI_API_KEY: 'injected-test-key', GEMINI_MODEL: 'configured-flash-model' }),
    fetchImpl
  });

  assert.equal(response.status, 200);
  const report = (await response.json()).report;
  assert.equal(report.tracking_number, 'CN-2026-000123');
  const uploadCalls = calls.filter((call) => call.url.includes('/storage/v1/object/'));
  assert.equal(uploadCalls.length, 2);
  assert.ok(uploadCalls.every((call) => call.url.includes('/storage/v1/object/report-evidence/')));
  assert.ok(uploadCalls.every((call) => call.options.headers['x-upsert'] === 'false'));
  assert.ok(uploadCalls.every((call) => call.options.body instanceof Blob));
  const geminiCall = calls.find((call) => call.url.includes('generativelanguage.googleapis.com'));
  assert.match(geminiCall.url, /\/models\/configured-flash-model:generateContent/);
  const geminiRequest = JSON.parse(geminiCall.options.body);
  const audioInline = geminiRequest.contents[0].parts.find(({ inline_data }) => inline_data?.mime_type === 'audio/wav').inline_data;
  const uploadedAudio = uploadCalls.find((call) => call.url.includes('/audio-'));
  assert.deepEqual(
    Buffer.from(audioInline.data, 'base64'),
    Buffer.from(await uploadedAudio.options.body.arrayBuffer())
  );

  const authCall = calls.find((call) => call.url.endsWith('/auth/v1/user'));
  assert.equal(authCall.options.headers.Authorization, 'Bearer resident-session');
  const reportCall = calls.find((call) => call.url.includes('/rest/v1/reports'));
  const row = JSON.parse(reportCall.options.body);
  assert.equal(row.reporter_id, residentId);
  assert.equal(row.source, 'snap_and_say');
  assert.equal(row.id, report.id);
  assert.equal('audio_url' in row, false);
  const evidenceCalls = calls.filter((call) => call.url.endsWith('/rest/v1/report_evidence'));
  assert.equal(evidenceCalls.length, 2);
  const evidenceRows = evidenceCalls.map((call) => JSON.parse(call.options.body));
  assert.ok(evidenceRows.every((evidence) => evidence.bucket === 'report-evidence'));
  assert.ok(evidenceRows.every((evidence) => evidence.report_id === report.id));
  assert.ok(evidenceRows.every((evidence) => evidence.path.startsWith(`${residentId}/${report.id}/`)));
  assert.deepEqual(report.evidence.map(({ kind }) => kind), ['audio', 'image']);
  const eventCalls = calls.filter((call) => call.url.endsWith('/rest/v1/rpc/log_report_event'));
  assert.deepEqual(eventCalls.map((call) => JSON.parse(call.options.body).p_event_type), ['ai_classified', 'routed']);
  const aiRunCall = calls.find((call) => call.url.endsWith('/rest/v1/ai_runs'));
  assert.ok(aiRunCall);
  const aiRun = JSON.parse(aiRunCall.options.body);
  assert.equal(aiRun.model, 'configured-flash-model');
  assert.equal(aiRun.prompt_version, 'snap-and-say-v1');
  assert.ok(aiRun.raw_output);
  assert.equal(aiRun.error, null);
  assert.equal(row.latitude, -29.85);
  assert.equal(row.longitude, 31.02);
  assert.equal(row.location, 'SRID=4326;POINT(31.02 -29.85)');
  assert.equal('audio_blob' in report, false);
  assert.equal('image_blob' in report, false);
});

test('rejects audio larger than the 5 MiB server limit before uploading', async () => {
  const calls = [];
  const response = await handleSnapAndSay(createRequest({
    audioLength: 5 * 1024 * 1024 + 1
  }), {
    ...testContext(async (url) => {
      calls.push(String(url));
      return new Response('{}', { status: 200 });
    })
  });

  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'AUDIO_TOO_LARGE');
  assert.equal(calls.some((url) => url.includes('/storage/v1/object/')), false);
});

test('removes the report and uploaded evidence if evidence metadata cannot be saved', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, method: options.method || 'GET', options });
    if (target.endsWith('/rest/v1/reports') && options.method === 'POST') {
      return new Response(JSON.stringify([{ id: JSON.parse(options.body).id }]), { status: 201 });
    }
    if (target.endsWith('/rest/v1/report_evidence')) {
      return new Response('metadata unavailable', { status: 500 });
    }
    return new Response('{}', { status: 200 });
  };

  const response = await handleSnapAndSay(createRequest({}), testContext(fetchImpl));
  assert.equal(response.status, 500);
  assert.equal(calls.filter((call) => call.method === 'DELETE' && call.url.includes('/rest/v1/reports?id=')).length, 1);
  assert.equal(calls.filter((call) => call.method === 'DELETE' && call.url.endsWith('/storage/v1/object/report-evidence')).length, 2);
  const uploadPaths = calls
    .filter((call) => call.method === 'POST' && call.url.includes('/storage/v1/object/report-evidence/'))
    .map((call) => call.url.split('/storage/v1/object/report-evidence/')[1]);
  const storageDeletes = calls.filter((call) =>
    call.method === 'DELETE' && call.url.endsWith('/storage/v1/object/report-evidence')
  );
  assert.deepEqual(
    await Promise.all(storageDeletes.map(async (call) => JSON.parse(await call.options.body.text()).prefixes[0])),
    uploadPaths
  );
});

test('missing Gemini key stores the report as Needs Review and logs configuration error', async () => {
  const errors = [];
  let aiRun;
  const originalConsoleError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const fetchImpl = async (url, options = {}) => {
      if (String(url).includes('/rest/v1/reports')) {
        return new Response(JSON.stringify([{ id: 'report-needs-review' }]), { status: 201 });
      }
      if (String(url).endsWith('/rest/v1/ai_runs')) {
        aiRun = JSON.parse(options.body);
      }
      return new Response('{}', { status: 200 });
    };
    const response = await handleSnapAndSay(createRequest({}), {
      env: createEnv({ GEMINI_API_KEY: '' }),
      fetchImpl,
      resolveUserId: async () => 'd1c82fc5-5ff2-4a79-a83c-829ba872e1f6'
    });
    assert.equal(response.status, 200);
    const report = (await response.json()).report;
    assert.equal(report.status, 'Needs Review');
    assert.equal(report.needs_human_review, true);
    assert.match(errors.join(' '), /Gemini API key is not configured/);
    assert.match(aiRun.error, /^key_problem:/);
  } finally {
    console.error = originalConsoleError;
  }
});

test('records provider failures in ai_runs after redacting the configured Gemini key', async () => {
  const apiKey = 'test-gemini-key';
  let geminiCalls = 0;
  let aiRun;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('generativelanguage.googleapis.com')) {
      geminiCalls += 1;
      return new Response(JSON.stringify({
        error: { message: `Provider rejected request; credential ${apiKey} was not accepted.` }
      }), { status: 400 });
    }
    if (target.endsWith('/rest/v1/reports') && options.method === 'POST') {
      const row = JSON.parse(options.body);
      return new Response(JSON.stringify([{ id: row.id, tracking_number: 'CN-2026-000125' }]), { status: 201 });
    }
    if (target.endsWith('/rest/v1/ai_runs')) {
      aiRun = JSON.parse(options.body);
      return new Response('{}', { status: 201 });
    }
    return new Response('{}', { status: 200 });
  };

  const response = await handleSnapAndSay(createRequest(), {
    env: createEnv({ GEMINI_API_KEY: apiKey }),
    fetchImpl,
    resolveUserId: async () => 'd1c82fc5-5ff2-4a79-a83c-829ba872e1f6'
  });

  assert.equal(response.status, 200);
  assert.equal(geminiCalls, 1);
  assert.equal(aiRun.model, GEMINI_MODEL);
  assert.match(aiRun.error, /Provider rejected request/);
  assert.match(aiRun.error, /\[REDACTED\]/);
  assert.equal(aiRun.error.includes(apiKey), false);
});

test('accepts an anonymous Supabase session and returns a guest lookup code on fallback', async () => {
  const guestId = '32000000-0000-4000-8000-000000000001';
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: guestId, is_anonymous: true }), { status: 200 });
    }
    if (target.includes('/rest/v1/reports') && options.method === 'POST') {
      const row = JSON.parse(options.body);
      return new Response(JSON.stringify([{
        id: row.id,
        tracking_number: 'CN-2026-900002',
        status: row.status
      }]), { status: 201 });
    }
    if (target.includes('/rest/v1/guest_report_lookup_secrets')) {
      return new Response(null, { status: 201 });
    }
    return new Response('{}', { status: 200 });
  };
  const response = await handleSnapAndSay(createRequest({
    authorization: 'Bearer anonymous-session-token'
  }), {
    env: createEnv({
      GEMINI_API_KEY: '',
      GUEST_LOOKUP_HMAC_KEY: 'test-only-guest-hmac-key'
    }),
    fetchImpl
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.report.status, 'Needs Review');
  assert.equal(body.report.tracking_number, 'CN-2026-900002');
  assert.match(body.report.lookup_code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);

  const authCall = calls.find(({ url }) => url.endsWith('/auth/v1/user'));
  assert.equal(authCall.options.headers.Authorization, 'Bearer anonymous-session-token');
  const reportRow = JSON.parse(calls.find(({ url, options }) =>
    url.includes('/rest/v1/reports') && options.method === 'POST'
  ).options.body);
  assert.equal(reportRow.reporter_id, guestId);
  assert.equal(reportRow.reporter_type, 'guest');
  assert.equal(reportRow.source, 'snap_and_say');
  assert.equal(reportRow.status, 'Needs Review');
  assert.equal(reportRow.location, 'SRID=4326;POINT(31.02 -29.85)');
  assert.equal(reportRow.latitude, -29.85);
  assert.equal(reportRow.longitude, 31.02);

  const mediaUploads = calls.filter(({ url }) => url.includes('/storage/v1/object/report-evidence/'));
  assert.equal(mediaUploads.length, 2);
  assert.ok(mediaUploads.every(({ options }) => options.body instanceof Blob));
  const evidenceCalls = calls.filter(({ url }) => url.endsWith('/rest/v1/report_evidence'));
  assert.equal(evidenceCalls.length, 2);
  assert.ok(evidenceCalls.every(({ options }) => (
    JSON.parse(options.body).report_id === reportRow.id
  )));
  const secretCall = calls.find(({ url }) => url.includes('/rest/v1/guest_report_lookup_secrets'));
  const savedSecret = JSON.parse(secretCall.options.body);
  assert.equal(savedSecret.report_id, reportRow.id);
  assert.match(savedSecret.lookup_code_hash, /^[0-9a-f]{64}$/);
  assert.equal(secretCall.options.body.includes(body.report.lookup_code), false);
});

test('returns the existing guest receipt for a repeated idempotency key', async () => {
  const guestId = '32000000-0000-4000-8000-000000000002';
  const calls = [];
  const existing = {
    id: 'b8f2cd6b-8304-4e3e-b5ab-ddf26a2fd0ca',
    tracking_number: 'CN-2026-900003',
    status: 'Needs Review',
    report_level: 'MEDIUM',
    ai_category: 'Unclear report',
    created_at: '2026-10-12T10:00:00.000Z',
    updated_at: '2026-10-12T10:00:00.000Z',
    resolved_at: null
  };
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target.includes('/rest/v1/reports?')) {
      if (options.method === 'POST') throw new Error('Duplicate report insert must not happen.');
      return new Response(JSON.stringify([existing]), { status: 200 });
    }
    if (target.includes('/storage/v1/object/')) {
      throw new Error('Duplicate evidence upload must not happen.');
    }
    return new Response('{}', { status: 200 });
  };
  const response = await handleSnapAndSay(createRequest({
    extraFormData: { idempotency_key: 'snap-idempotency-test-0002' }
  }), {
    env: createEnv({ GUEST_LOOKUP_HMAC_KEY: 'test-only-guest-hmac-key' }),
    fetchImpl,
    resolveUserId: async () => ({ id: guestId, is_anonymous: true })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.idempotent_replay, true);
  assert.equal(body.report.tracking_number, existing.tracking_number);
  assert.match(body.report.lookup_code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
  assert.equal(calls.filter(({ url, options }) =>
    url.includes('/rest/v1/reports') && options.method === 'POST'
  ).length, 0);
  assert.equal(calls.some(({ url }) => url.includes('/storage/v1/object/')), false);
});

test('allows a report without GPS and marks it as no_gps', async () => {
  const response = await handleSnapAndSay(createRequest({ withGps: false }), testContext(createGeminiFetch({
      original_transcription: 'There is water on the road.',
      detected_language: 'en',
      english_translation: 'There is water on the road.',
      visual_evidence_summary: 'Standing water by the road.',
      photo_matches_report: true,
      issue_category: 'Flooding',
      urgency: 'HIGH',
      requires_immediate_dispatch: false,
      extracted_location: 'No location details were provided by the reporter.',
      recommended_organization: { organization_name: 'City of eThekwini Roads & Stormwater', jurisdiction_level: 'municipal', reasoning: 'Handles local flooding' },
      alternative_organizations: ['Metro Emergency Services'],
      classification_confidence: 0.81,
      routing_confidence: 0.8,
      needs_human_review: false,
      review_reason: ''
    })));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.report.gps_status, 'no_gps');
  assert.equal(body.report.status, 'Needs Review');
  assert.equal(body.processing, true);
});

test('surfaces emergency numbers for critical reports', async () => {
  const calls = [];
  const validResult = {
      original_transcription: 'There is smoke and people are trapped in the building.',
      detected_language: 'en',
      english_translation: 'There is smoke and people are trapped in the building.',
      visual_evidence_summary: 'Smoke and flames visible from the structure.',
      photo_matches_report: true,
      issue_category: 'Fire',
      urgency: 'CRITICAL',
      requires_immediate_dispatch: true,
      extracted_location: 'Inside the building next to the station.',
      recommended_organization: { organization_name: 'City Fire and Rescue', jurisdiction_level: 'municipal', reasoning: 'Immediate rescue response needed.' },
      alternative_organizations: ['EMS'],
      classification_confidence: 0.97,
      routing_confidence: 0.9,
      needs_human_review: false,
      review_reason: ''
  };
  const geminiFetch = createGeminiFetch(validResult);
  const response = await handleSnapAndSay(createRequest({}), testContext(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return geminiFetch(url, options);
  }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.processing, true);
  assert.equal(body.report.status, 'Needs Review');
  const updateCall = calls.find(({ url, options }) =>
    url.includes('/rest/v1/reports?id=') && options.method === 'PATCH'
  );
  const update = JSON.parse(updateCall.options.body);
  assert.equal(update.report_level, 'CRITICAL');
  assert.equal(update.requires_immediate_dispatch, true);
  assert.equal(update.status, 'Needs Review');
});

test('returns the saved receipt before Gemini finishes', async () => {
  let finishGemini;
  let backgroundTask;
  let aiRunSaved = false;
  const geminiPending = new Promise((resolve) => {
    finishGemini = resolve;
  });
  const validResult = {
    original_transcription: 'There is a broken street light.',
    detected_language: 'en',
    english_translation: 'There is a broken street light.',
    visual_evidence_summary: 'A damaged street light is visible.',
    photo_matches_report: true,
    issue_category: 'Street lighting',
    urgency: 'MEDIUM',
    requires_immediate_dispatch: false,
    extracted_location: 'GPS location provided.',
    recommended_organization: { organization_name: 'Municipal Electricity Department' },
    alternative_organizations: [],
    classification_confidence: 0.9,
    routing_confidence: 0.85,
    needs_human_review: false,
    review_reason: ''
  };
  const fetchGemini = createGeminiFetch(validResult);
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('generativelanguage.googleapis.com')) {
      return await geminiPending;
    }
    if (target.endsWith('/rest/v1/ai_runs')) aiRunSaved = true;
    return await fetchGemini(url, options);
  };
  const responsePromise = handleSnapAndSay(createRequest(), {
    ...testContext(fetchImpl),
    waitUntil: (task) => {
      backgroundTask = task;
    }
  });
  const response = await responsePromise;
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.processing, true);
  assert.equal(body.report.status, 'Needs Review');
  assert.equal(aiRunSaved, false);
  assert.ok(backgroundTask instanceof Promise);

  finishGemini(new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(validResult) }] } }]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await backgroundTask;
  assert.equal(aiRunSaved, true);
});

test('a Gemini failure leaves the saved report in Needs Review', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ target, options });
    if (target.includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ error: { message: 'Quota exceeded.' } }), { status: 429 });
    }
    if (target.endsWith('/rest/v1/reports') && options.method === 'POST') {
      return new Response(JSON.stringify([{ ...JSON.parse(options.body), tracking_number: 'CN-2026-000199' }]), { status: 201 });
    }
    return new Response('{}', { status: target.includes('/rest/v1/reports?id=') ? 204 : 201 });
  };

  const response = await handleSnapAndSay(createRequest(), testContext(fetchImpl));
  const body = await response.json();
  const initialInsert = calls.find(({ target, options }) => target.endsWith('/rest/v1/reports') && options.method === 'POST');
  const savedRun = JSON.parse(calls.find(({ target }) => target.endsWith('/rest/v1/ai_runs')).options.body);

  assert.equal(response.status, 200);
  assert.equal(body.report.status, 'Needs Review');
  assert.equal(JSON.parse(initialInsert.options.body).status, 'Needs Review');
  assert.match(savedRun.error, /^rate_limited:/);
  assert.equal(calls.some(({ target, options }) => target.includes('/rest/v1/reports?id=') && options.method === 'PATCH'), false);
});

test('retries transient Gemini 503 responses in the background', async () => {
  let geminiCalls = 0;
  let reportUpdate;
  const validResult = {
    original_transcription: 'A damaged road needs repair.',
    detected_language: 'en',
    english_translation: 'A damaged road needs repair.',
    visual_evidence_summary: 'A damaged road is visible.',
    photo_matches_report: true,
    issue_category: 'Road damage',
    urgency: 'LOW',
    requires_immediate_dispatch: false,
    extracted_location: 'GPS location provided.',
    recommended_organization: { organization_name: 'Municipality Roads Department' },
    alternative_organizations: [],
    classification_confidence: 0.9,
    routing_confidence: 0.9,
    needs_human_review: false,
    review_reason: ''
  };
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('generativelanguage.googleapis.com')) {
      geminiCalls += 1;
      if (geminiCalls < 3) {
        return new Response(JSON.stringify({
          error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' }
        }), { status: 503 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(validResult) }] } }]
      }), { status: 200 });
    }
    if (target.includes('/rest/v1/reports?id=') && options.method === 'PATCH') {
      reportUpdate = JSON.parse(options.body);
      return new Response(null, { status: 204 });
    }
    if (target.endsWith('/rest/v1/reports') && options.method === 'POST') {
      return new Response(JSON.stringify([{ ...JSON.parse(options.body), tracking_number: 'CN-2026-000201' }]), { status: 201 });
    }
    return new Response('{}', { status: 200 });
  };
  const response = await handleSnapAndSay(createRequest(), testContext(fetchImpl));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.processing, true);
  assert.equal(geminiCalls, 3);
  assert.equal(reportUpdate.description_original, validResult.original_transcription);
  assert.equal(reportUpdate.ai_category, validResult.issue_category);
  assert.equal(reportUpdate.status, 'Pending Dispatch');
});

test('falls back to GEMINI_FALLBACK_MODEL after primary retries return 429 or 503', async () => {
  const validResult = {
    original_transcription: 'A damaged road needs repair.',
    detected_language: 'en',
    english_translation: 'A damaged road needs repair.',
    visual_evidence_summary: 'A damaged road is visible.',
    photo_matches_report: true,
    issue_category: 'Road damage',
    urgency: 'LOW',
    requires_immediate_dispatch: false,
    extracted_location: 'GPS location provided.',
    recommended_organization: { organization_name: 'Municipality Roads Department' },
    alternative_organizations: [],
    classification_confidence: 0.9,
    routing_confidence: 0.9,
    needs_human_review: false,
    review_reason: ''
  };

  for (const primaryStatus of [429, 503]) {
    const attemptedModels = [];
    let primaryAttempts = 0;
    let savedRun;
    const fetchImpl = async (url, options = {}) => {
      const target = String(url);
      if (target.includes('generativelanguage.googleapis.com')) {
        const model = target.match(/\/models\/([^:]+):generateContent/)?.[1];
        attemptedModels.push(model);
        if (model === 'primary-test-model') {
          primaryAttempts += 1;
          return new Response(JSON.stringify({
            error: { code: primaryStatus, message: 'Temporary provider limit.' }
          }), { status: primaryStatus });
        }
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(validResult) }] } }]
        }), { status: 200 });
      }
      if (target.endsWith('/rest/v1/ai_runs')) {
        savedRun = JSON.parse(options.body);
      }
      if (target.endsWith('/rest/v1/reports') && options.method === 'POST') {
        return new Response(JSON.stringify([{
          ...JSON.parse(options.body),
          tracking_number: 'CN-2026-000202'
        }]), { status: 201 });
      }
      return target.includes('/rest/v1/reports?id=')
        ? new Response(null, { status: 204 })
        : new Response('{}', { status: 200 });
    };

    const context = {
      ...testContext(fetchImpl),
      env: createEnv({
        GEMINI_MODEL: 'primary-test-model',
        GEMINI_FALLBACK_MODEL: 'fallback-test-model'
      })
    };
    const response = await handleSnapAndSay(createRequest(), context);
    assert.equal(response.status, 200);
    assert.equal(primaryAttempts, 3);
    assert.deepEqual(attemptedModels, [
      'primary-test-model',
      'primary-test-model',
      'primary-test-model',
      'fallback-test-model'
    ]);
    assert.equal(savedRun.model, 'fallback-test-model');
    assert.equal(savedRun.error, null);
  }
});

test('AI failure metadata never stores configured secrets', async () => {
  const apiKey = 'private-test-gemini-key';
  let savedRun;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('generativelanguage.googleapis.com')) {
      throw new Error(`request failed: https://provider.invalid/?key=${apiKey}`);
    }
    if (target.endsWith('/rest/v1/ai_runs')) savedRun = JSON.parse(options.body);
    if (target.endsWith('/rest/v1/reports') && options.method === 'POST') {
      return new Response(JSON.stringify([{ ...JSON.parse(options.body), tracking_number: 'CN-2026-000200' }]), { status: 201 });
    }
    return new Response('{}', { status: 200 });
  };

  await handleSnapAndSay(createRequest(), {
    ...testContext(fetchImpl),
    env: createEnv({ GEMINI_API_KEY: apiKey })
  });
  assert.ok(savedRun);
  assert.equal(JSON.stringify(savedRun).includes(apiKey), false);
  assert.match(savedRun.error, /key=\[REDACTED\]/);
  assert.equal(savedRun.raw_output, null);
});
