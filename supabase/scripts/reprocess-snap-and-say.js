import {
  callGemini,
  finalizeGeminiResult,
  GEMINI_MODEL,
  parseGeminiJson,
  PROMPT_VERSION
} from '../functions/snap-and-say/handler.js';

const STAGING_HOST = 'gnwaaedtofazlkjkurea.supabase.co';
const REPORT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACKING_NUMBER_PATTERN = /^CN-\d{4}-\d{4,}$/;
const REPORT_FIELDS = [
  'id', 'status', 'report_level', 'description_original', 'description_english',
  'detected_language', 'visual_evidence_summary', 'photo_matches_report',
  'ai_category', 'urgency', 'requires_immediate_dispatch', 'extracted_location',
  'recommended_organization', 'recommended_organization_text', 'alternative_organizations',
  'classification_confidence', 'routing_confidence', 'needs_human_review',
  'review_reason', 'latitude', 'longitude', 'location_accuracy', 'gps_status',
  'device_timestamp', 'tracking_number'
].join(',');

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment variable ${name} is not set.`);
  return value;
}

function createEnvironment(values) {
  return { get: (name) => values[name] || '' };
}

function safeErrorText(text, serviceRole, geminiKey) {
  return String(text || '')
    .split(serviceRole).join('[REDACTED]')
    .split(geminiKey).join('[REDACTED]');
}

function headers(serviceRole, extra = {}) {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    ...extra
  };
}

async function checkedJson(response, operation, serviceRole, geminiKey) {
  if (!response.ok) {
    const detail = safeErrorText(await response.text(), serviceRole, geminiKey);
    throw new Error(`${operation} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

async function checkedResponse(response, operation, serviceRole, geminiKey) {
  if (!response.ok) {
    const detail = safeErrorText(await response.text(), serviceRole, geminiKey);
    throw new Error(`${operation} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response;
}

function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function storageObjectUrl(projectUrl, path) {
  const safePath = path.split('/').map(encodeURIComponent).join('/');
  return `${projectUrl}/storage/v1/object/authenticated/report-evidence/${safePath}`;
}

async function storeAiRun(projectUrl, serviceRole, geminiKey, reportId, run) {
  await checkedJson(await fetch(`${projectUrl}/rest/v1/ai_runs`, {
    method: 'POST',
    headers: headers(serviceRole, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify({
      report_id: reportId,
      model: GEMINI_MODEL,
      prompt_version: PROMPT_VERSION,
      raw_output: run.rawOutput,
      latency_ms: run.latencyMs,
      tokens: run.tokens,
      error: run.error === null || run.error === undefined
        ? null
        : safeErrorText(run.error, serviceRole, geminiKey)
    })
  }), 'Saving AI run metadata', serviceRole, geminiKey);
}

async function logReportEvent(projectUrl, serviceRole, geminiKey, reportId, eventType, note) {
  await checkedJson(await fetch(`${projectUrl}/rest/v1/rpc/log_report_event`, {
    method: 'POST',
    headers: headers(serviceRole, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      p_report_id: reportId,
      p_event_type: eventType,
      p_note: note,
      p_actor: null
    })
  }), `Logging ${eventType} event`, serviceRole, geminiKey);
}

async function reprocessReport(identifier, projectUrl, serviceRole, geminiKey) {
  const reportUrl = new URL('/rest/v1/reports', projectUrl);
  reportUrl.searchParams.set('select', REPORT_FIELDS);
  reportUrl.searchParams.set(
    REPORT_ID_PATTERN.test(identifier) ? 'id' : 'tracking_number',
    `eq.${identifier}`
  );
  reportUrl.searchParams.set('limit', '2');
  const reports = await checkedJson(await fetch(reportUrl, {
    headers: headers(serviceRole)
  }), 'Reading report', serviceRole, geminiKey);
  if (reports.length !== 1) throw new Error('Report was not found uniquely.');
  const report = reports[0];
  const reportId = report.id;
  if (report.status !== 'Needs Review') {
    throw new Error('Report is not in Needs Review status; no changes were made.');
  }

  const evidenceUrl = new URL('/rest/v1/report_evidence', projectUrl);
  evidenceUrl.searchParams.set('select', 'kind,bucket,path,mime_type,duration_seconds');
  evidenceUrl.searchParams.set('report_id', `eq.${reportId}`);
  evidenceUrl.searchParams.set('bucket', 'eq.report-evidence');
  const evidence = await checkedJson(await fetch(evidenceUrl, {
    headers: headers(serviceRole)
  }), 'Reading report evidence', serviceRole, geminiKey);
  const audio = evidence.find((item) => item.kind === 'audio');
  if (!audio) throw new Error('Report has no audio evidence; no changes were made.');
  const image = evidence.find((item) => item.kind === 'image');
  const audioResponse = await checkedResponse(await fetch(storageObjectUrl(projectUrl, audio.path), {
    headers: headers(serviceRole)
  }), 'Downloading audio evidence', serviceRole, geminiKey);
  const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());

  let imageBase64;
  if (image) {
    const imageResponse = await checkedResponse(await fetch(storageObjectUrl(projectUrl, image.path), {
      headers: headers(serviceRole)
    }), 'Downloading image evidence', serviceRole, geminiKey);
    imageBase64 = base64(new Uint8Array(await imageResponse.arrayBuffer()));
  }

  const payload = {
    audio_base64: base64(audioBytes),
    audio_mime_type: audio.mime_type,
    audio_transcript: report.description_original || '',
    duration_seconds: audio.duration_seconds || 1,
    ...(imageBase64 ? { image_base64: imageBase64, image_mime_type: image.mime_type } : {}),
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

  const startedAt = Date.now();
  let rawOutput = null;
  let result;
  try {
    rawOutput = await callGemini({
      env: createEnvironment({ GEMINI_API_KEY: geminiKey }),
      fetchImpl: fetch,
      payload
    });
    result = finalizeGeminiResult(payload, parseGeminiJson(rawOutput));
  } catch (error) {
    await storeAiRun(projectUrl, serviceRole, geminiKey, reportId, {
      rawOutput,
      latencyMs: Date.now() - startedAt,
      tokens: rawOutput?.usageMetadata || null,
      error: safeErrorText(error?.message || 'Gemini processing failed.', serviceRole, geminiKey)
    });
    throw new Error(`Gemini processing failed; error details were recorded in ai_runs: ${safeErrorText(error?.message, serviceRole, geminiKey)}`);
  }

  const update = {
    description_original: result.original_transcription,
    description_english: result.english_translation,
    detected_language: result.detected_language,
    visual_evidence_summary: result.visual_evidence_summary,
    photo_matches_report: result.photo_matches_report,
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
  const updateUrl = new URL('/rest/v1/reports', projectUrl);
  updateUrl.searchParams.set('id', `eq.${reportId}`);
  await checkedJson(await fetch(updateUrl, {
    method: 'PATCH',
    headers: headers(serviceRole, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    }),
    body: JSON.stringify(update)
  }), 'Updating report classification', serviceRole, geminiKey);

  await storeAiRun(projectUrl, serviceRole, geminiKey, reportId, {
    rawOutput,
    latencyMs: Date.now() - startedAt,
    tokens: rawOutput?.usageMetadata || null,
    error: null
  });
  await logReportEvent(
    projectUrl, serviceRole, geminiKey, reportId, 'ai_classified',
    `AI category: ${result.issue_category}; level: ${result.urgency}.`
  );
  await logReportEvent(
    projectUrl, serviceRole, geminiKey, reportId, 'routed',
    `Recommended organization: ${result.recommended_organization.organization_name || 'unassigned'}.`
  );

  return {
    id: reportId,
    status: result.status,
    category: result.issue_category,
    urgency: result.urgency,
    tracking_number: report.tracking_number
  };
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length || ids.some((id) => !REPORT_ID_PATTERN.test(id) && !TRACKING_NUMBER_PATTERN.test(id))) {
    throw new Error('Pass one or more explicit report UUIDs or tracking numbers. No bulk mode is supported.');
  }

  const projectUrl = requiredEnv('SUPABASE_URL');
  const serviceRole = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const geminiKey = requiredEnv('GEMINI_API_KEY');
  const parsedUrl = new URL(projectUrl);
  if (parsedUrl.hostname !== STAGING_HOST) {
    throw new Error('This recovery script is restricted to the configured staging project.');
  }
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate report identifiers are not allowed.');

  let failures = 0;
  for (const id of ids) {
    try {
      console.log(JSON.stringify(await reprocessReport(id, projectUrl, serviceRole, geminiKey)));
    } catch (error) {
      failures += 1;
      console.error(JSON.stringify({
        report: id,
        error: safeErrorText(error?.message || 'Reprocessing failed.', serviceRole, geminiKey)
      }));
    }
  }
  if (failures) process.exitCode = 1;
}

main().catch((error) => fail(error.message));
