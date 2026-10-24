import {
  callGemini,
  configuredGeminiModel,
  finalizeGeminiResult,
  GEMINI_MODEL,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  parseGeminiJson,
  PROMPT_VERSION
} from '../snap-and-say/handler.js';
import { withCors } from '../_shared/cors.js';

const CORS_HEADERS = { 'Content-Type': 'application/json' };
const STAGING_HOST = 'gnwaaedtofazlkjkurea.supabase.co';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACKING_NUMBER_PATTERN = /^CN-\d{4}-\d{4,}$/;
const REPORT_FIELDS = [
  'id', 'status', 'tracking_number', 'report_level', 'description_original',
  'ai_category', 'urgency', 'requires_immediate_dispatch',
  'recommended_organization_text', 'visual_evidence_summary',
  'latitude', 'longitude', 'location_accuracy', 'gps_status'
].join(',');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

async function constantTimeEqual(leftValue, rightValue) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(leftValue)),
    crypto.subtle.digest('SHA-256', encoder.encode(rightValue))
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function safeErrorText(value, secrets) {
  let message = String(value || 'Reprocessing failed.');
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return message;
}

async function rateLimitKeyHash(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function consumeAdminRateLimit(projectUrl, serviceRole, secret, fetchImpl) {
  let result;
  try {
    result = await checkedJson(await fetchImpl(`${projectUrl}/rest/v1/rpc/consume_report_rate_limit`, {
      method: 'POST',
      headers: apiHeaders(serviceRole, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        p_scope: 'reprocess-report-admin',
        p_key_hash: await rateLimitKeyHash(secret),
        p_request_limit: 5,
        p_window_seconds: 900
      })
    }), 'Applying reprocessing rate limit', [secret, serviceRole]);
  } catch {
    throw Object.assign(new Error('The reprocessing rate limit is unavailable.'), {
      status: 503,
      code: 'RATE_LIMIT_UNAVAILABLE'
    });
  }
  if (result?.allowed !== true) {
    throw Object.assign(new Error('Too many reprocessing requests. Try again later.'), {
      status: 429,
      code: 'RATE_LIMITED'
    });
  }
}

function apiHeaders(serviceRole, extra = {}) {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    ...extra
  };
}

async function checkedResponse(response, operation, secrets) {
  if (!response.ok) {
    const detail = safeErrorText(await response.text(), secrets);
    throw new Error(`${operation} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response;
}

async function checkedJson(response, operation, secrets) {
  const okResponse = await checkedResponse(response, operation, secrets);
  const text = await okResponse.text();
  return text ? JSON.parse(text) : null;
}

function storageObjectUrl(projectUrl, path) {
  const safePath = path.split('/').map(encodeURIComponent).join('/');
  return `${projectUrl}/storage/v1/object/authenticated/report-evidence/${safePath}`;
}

async function logEvent(projectUrl, serviceRole, secrets, reportId, eventType, note, fetchImpl) {
  await checkedJson(await fetchImpl(`${projectUrl}/rest/v1/rpc/log_report_event`, {
    method: 'POST',
    headers: apiHeaders(serviceRole, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      p_report_id: reportId,
      p_event_type: eventType,
      p_note: note,
      p_actor: null
    })
  }), `Logging ${eventType} event`, secrets);
}

async function saveAiRun(projectUrl, serviceRole, secrets, reportId, run, model, fetchImpl) {
  await checkedJson(await fetchImpl(`${projectUrl}/rest/v1/ai_runs`, {
    method: 'POST',
    headers: apiHeaders(serviceRole, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify({
      report_id: reportId,
      model,
      prompt_version: PROMPT_VERSION,
      raw_output: run.rawOutput,
      latency_ms: run.latencyMs,
      tokens: run.tokens,
      error: run.error ? safeErrorText(run.error, secrets) : null
    })
  }), 'Saving AI run metadata', secrets);
}

async function readReport(projectUrl, serviceRole, secrets, identifier, fetchImpl) {
  const url = new URL('/rest/v1/reports', projectUrl);
  url.searchParams.set('select', REPORT_FIELDS);
  url.searchParams.set(UUID_PATTERN.test(identifier) ? 'id' : 'tracking_number', `eq.${identifier}`);
  url.searchParams.set('limit', '2');
  const reports = await checkedJson(await fetchImpl(url, {
    headers: apiHeaders(serviceRole)
  }), 'Reading report', secrets);
  if (!Array.isArray(reports) || reports.length !== 1) {
    throw new Error('Report was not found uniquely.');
  }
  return reports[0];
}

async function processReport(identifier, env, serviceRole, secrets, fetchImpl) {
  const projectUrl = env.get('SUPABASE_URL');
  const report = await readReport(projectUrl, serviceRole, secrets, identifier, fetchImpl);
  if (report.status !== 'Needs Review') {
    throw new Error('Report is not in Needs Review status.');
  }

  const evidenceUrl = new URL('/rest/v1/report_evidence', projectUrl);
  evidenceUrl.searchParams.set('select', 'kind,bucket,path,mime_type,duration_seconds');
  evidenceUrl.searchParams.set('report_id', `eq.${report.id}`);
  evidenceUrl.searchParams.set('bucket', 'eq.report-evidence');
  const evidence = await checkedJson(await fetchImpl(evidenceUrl, {
    headers: apiHeaders(serviceRole)
  }), 'Reading report evidence', secrets);
  const audio = evidence.find((item) => item.kind === 'audio');
  if (!audio) throw new Error('Report has no audio evidence.');
  const image = evidence.find((item) => item.kind === 'image');

  const audioResponse = await checkedResponse(await fetchImpl(storageObjectUrl(projectUrl, audio.path), {
    headers: apiHeaders(serviceRole)
  }), 'Downloading audio evidence', secrets);
  const payload = {
    audio_blob: await audioResponse.blob(),
    audio_mime_type: audio.mime_type,
    audio_transcript: report.description_original || '',
    duration_seconds: audio.duration_seconds || 1,
    latitude: report.latitude,
    longitude: report.longitude,
    location_accuracy: report.location_accuracy,
    gps_status: report.gps_status || (report.latitude !== null && report.longitude !== null ? 'gps' : 'no_gps'),
    issue_category: report.ai_category || 'Unclear report',
    urgency: report.report_level || report.urgency || 'MEDIUM',
    requires_immediate_dispatch: report.requires_immediate_dispatch,
    recommended_organization: report.recommended_organization_text || 'Municipal dispatch desk',
    visual_summary: report.visual_evidence_summary || ''
  };
  if (payload.audio_blob.size > MAX_AUDIO_BYTES) {
    throw new Error('Audio evidence exceeds the Snap & Say processing limit.');
  }
  if (image) {
    const imageResponse = await checkedResponse(await fetchImpl(storageObjectUrl(projectUrl, image.path), {
      headers: apiHeaders(serviceRole)
    }), 'Downloading image evidence', secrets);
    payload.image_blob = await imageResponse.blob();
    payload.image_mime_type = image.mime_type;
    if (payload.image_blob.size > MAX_IMAGE_BYTES) {
      throw new Error('Image evidence exceeds the Snap & Say processing limit.');
    }
  }

  const model = configuredGeminiModel(env);
  const startedAt = Date.now();
  let rawOutput = null;
  try {
    rawOutput = await callGemini({ env, fetchImpl, payload });
    const result = finalizeGeminiResult(payload, parseGeminiJson(rawOutput));
    delete payload.audio_blob;
    delete payload.image_blob;
    delete result.audio_blob;
    delete result.image_blob;
    const update = {
      description_original: result.original_transcription,
      description_english: result.english_translation,
      detected_language: result.detected_language,
      visual_evidence_summary: result.visual_evidence_summary,
      ai_category: result.issue_category,
      urgency: result.urgency,
      report_level: result.urgency,
      requires_immediate_dispatch: result.requires_immediate_dispatch,
      extracted_location: result.extracted_location,
      recommended_organization: result.recommended_organization,
      recommended_organization_text: result.recommended_organization.organization_name,
      alternative_organizations: result.alternative_organizations,
      classification_confidence: result.classification_confidence,
      routing_confidence: result.routing_confidence,
      needs_human_review: result.needs_human_review,
      review_reason: result.review_reason,
      status: result.status
    };
    await checkedJson(await fetchImpl(`${projectUrl}/rest/v1/reports?id=eq.${encodeURIComponent(report.id)}`, {
      method: 'PATCH',
      headers: apiHeaders(serviceRole, {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }),
      body: JSON.stringify(update)
    }), 'Updating report classification', secrets);
    await saveAiRun(projectUrl, serviceRole, secrets, report.id, {
      rawOutput,
      latencyMs: Math.max(0, Date.now() - startedAt),
      tokens: rawOutput?.usageMetadata || null,
      error: null
    }, model, fetchImpl);
    await logEvent(projectUrl, serviceRole, secrets, report.id, 'ai_classified',
      `AI category: ${result.issue_category}; level: ${result.urgency}.`, fetchImpl);
    await logEvent(projectUrl, serviceRole, secrets, report.id, 'routed',
      `Recommended organization: ${result.recommended_organization.organization_name || 'unassigned'}.`, fetchImpl);
    return {
      identifier,
      id: report.id,
      tracking_number: report.tracking_number,
      status: result.status,
      category: result.issue_category,
      urgency: result.urgency,
      transcription: result.original_transcription,
      translation: result.english_translation,
      recommended_organization: result.recommended_organization.organization_name
    };
  } catch (error) {
    const safeError = safeErrorText(error?.message, secrets);
    await saveAiRun(projectUrl, serviceRole, secrets, report.id, {
      rawOutput,
      latencyMs: Math.max(0, Date.now() - startedAt),
      tokens: rawOutput?.usageMetadata || null,
      error: safeError
    }, model, fetchImpl);
    await logEvent(projectUrl, serviceRole, secrets, report.id, 'ai_reprocess_failed',
      'Automated recovery failed; the report remains in manual review.', fetchImpl);
    throw new Error(safeError);
  }
}

async function handleReprocessReportInternal(request, context = {}) {
  const env = context.env || { get: (name) => Deno.env.get(name) };
  const fetchImpl = context.fetchImpl || fetch;
  if (request.method === 'OPTIONS') return jsonResponse({ ok: true });
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  }

  const expectedSecret = env.get('ADMIN_TASK_SECRET') || '';
  const suppliedSecret = request.headers.get('x-admin-task-secret') || '';
  if (!expectedSecret || !(await constantTimeEqual(suppliedSecret, expectedSecret))) {
    return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized.' }, 401);
  }

  try {
    const projectUrl = env.get('SUPABASE_URL') || '';
    const serviceRole = env.get('SUPABASE_SERVICE_ROLE_KEY') || env.get('SUPABASE_SERVICE_ROLE') || '';
    const geminiKey = env.get('GEMINI_API_KEY') || env.get('GOOGLE_GENAI_API_KEY') || '';
    if (!projectUrl || !serviceRole || !geminiKey) {
      return jsonResponse({ ok: false, code: 'REPROCESS_NOT_CONFIGURED' }, 503);
    }
    if (new URL(projectUrl).hostname !== STAGING_HOST) {
      return jsonResponse({ ok: false, code: 'STAGING_ONLY' }, 403);
    }
    const body = await request.json();
    const identifiers = body?.reports;
    if (!Array.isArray(identifiers) || identifiers.length < 1 || identifiers.length > 5
      || identifiers.some((identifier) => typeof identifier !== 'string'
        || (!UUID_PATTERN.test(identifier) && !TRACKING_NUMBER_PATTERN.test(identifier)))) {
      return jsonResponse({
        ok: false,
        code: 'INVALID_REPORTS',
        message: 'Provide an array of one to five explicit report IDs or tracking numbers.'
      }, 422);
    }
    if (new Set(identifiers).size !== identifiers.length) {
      return jsonResponse({ ok: false, code: 'DUPLICATE_REPORTS' }, 422);
    }
    await consumeAdminRateLimit(projectUrl, serviceRole, expectedSecret, fetchImpl);

    const secrets = [serviceRole, geminiKey, expectedSecret];
    const results = [];
    for (const identifier of identifiers) {
      try {
        results.push({ ok: true, report: await processReport(identifier, env, serviceRole, secrets, fetchImpl) });
      } catch (error) {
        results.push({
          ok: false,
          identifier,
          error: safeErrorText(error?.message, secrets)
        });
      }
    }
    return jsonResponse({ ok: results.every((result) => result.ok), results });
  } catch (error) {
    const status = Number(error?.status || 400);
    return jsonResponse({
      ok: false,
      code: error?.code || 'REPROCESS_REQUEST_FAILED',
      message: safeErrorText(error?.message, [
        env.get('SUPABASE_SERVICE_ROLE_KEY'),
        env.get('SUPABASE_SERVICE_ROLE'),
        env.get('GEMINI_API_KEY'),
        env.get('GOOGLE_GENAI_API_KEY'),
        env.get('ADMIN_TASK_SECRET')
      ])
    }, status);
  }
}

async function handleReprocessReport(request, context = {}) {
  const result = await handleReprocessReportInternal(request, context);
  return withCors(result, request, context.env, {
    allowHeaders: 'apikey, content-type, x-admin-task-secret'
  });
}

export { handleReprocessReport, constantTimeEqual };
