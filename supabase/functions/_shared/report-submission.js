const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 10000;
const MAX_ADDRESS_LENGTH = 500;
const MAX_CATEGORY_LENGTH = 120;
const MAX_ORG_TEXT_LENGTH = 120;
const LOOKUP_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const IMAGE_TYPES = new Set([
  'image/heic', 'image/heif', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'
]);
const VIDEO_TYPES = new Set([
  'video/3gpp', 'video/mp4', 'video/quicktime', 'video/webm'
]);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

function safeErrorCode(value, fallback) {
  return typeof value === 'string' && /^(?:[A-Z][A-Z0-9_]{2,31}|[0-9A-Z]{5})$/.test(value)
    ? value
    : fallback;
}

function logSubmissionFailure(operation, code, status, cleanupStatus) {
  console.error('Report submission failed.', {
    operation,
    code: safeErrorCode(code, 'REPORT_SUBMISSION_FAILED'),
    status: Number.isInteger(status) ? status : null,
    cleanup_status: cleanupStatus
  });
}

function normalizeMime(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function optionalText(value, maxLength, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw httpError(422, 'INVALID_FIELD', `${label} is invalid.`);
  }
  return value.trim() || null;
}

async function readRequest(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    const form = await request.formData();
    const values = {};
    const files = {};
    for (const [key, value] of form.entries()) {
      if (value instanceof Blob) {
        if (key === 'photo' || key === 'video') files[key] = value;
      } else {
        values[key] = value;
      }
    }
    return { values, files };
  }
  let body;
  try {
    body = await request.json();
  } catch {
    throw httpError(400, 'INVALID_JSON', 'The report request is invalid.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'INVALID_BODY', 'The report request is invalid.');
  }
  return { values: body, files: {} };
}

function validateReport(values, files) {
  const idempotencyKey = String(values.idempotency_key || values.idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw httpError(422, 'INVALID_IDEMPOTENCY_KEY', 'A valid idempotency key is required.');
  }

  const category = optionalText(values.category, MAX_CATEGORY_LENGTH, 'Category');
  const description = optionalText(values.description, MAX_DESCRIPTION_LENGTH, 'Description');
  const address = optionalText(values.address, MAX_ADDRESS_LENGTH, 'Address');
  const organization = optionalText(
    values.user_selected_organization ?? values.organisation ?? values.organization,
    MAX_ORG_TEXT_LENGTH,
    'Organisation'
  );
  const branch = optionalText(values.user_selected_branch ?? values.branch, MAX_ORG_TEXT_LENGTH, 'Branch');
  if (!category || !description) {
    throw httpError(422, 'MISSING_REQUIRED_FIELD', 'Category and description are required.');
  }

  const latitudeValue = values.latitude;
  const longitudeValue = values.longitude;
  const hasLatitude = latitudeValue !== undefined && latitudeValue !== null && latitudeValue !== '';
  const hasLongitude = longitudeValue !== undefined && longitudeValue !== null && longitudeValue !== '';
  if (hasLatitude !== hasLongitude) {
    throw httpError(422, 'INVALID_LOCATION', 'Provide both coordinates or neither.');
  }
  let latitude = null;
  let longitude = null;
  if (hasLatitude) {
    latitude = Number(latitudeValue);
    longitude = Number(longitudeValue);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw httpError(422, 'INVALID_LOCATION', 'The location coordinates are invalid.');
    }
  } else if (!address) {
    throw httpError(422, 'MISSING_LOCATION', 'Provide an address or choose a map pin.');
  }

  const evidence = [];
  for (const [field, kind, allowedTypes] of [
    ['photo', 'image', IMAGE_TYPES],
    ['video', 'video', VIDEO_TYPES]
  ]) {
    const file = files[field];
    if (!file) continue;
    const mimeType = normalizeMime(file.type);
    if (!allowedTypes.has(mimeType)) {
      throw httpError(415, 'UNSUPPORTED_EVIDENCE_MIME', `The ${field} file type is not supported.`);
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      throw httpError(413, 'EVIDENCE_SIZE_INVALID', `The ${field} must be between 1 byte and 25 MiB.`);
    }
    evidence.push({ field, kind, mimeType, file });
  }

  const guestContact = optionalText(values.guest_contact ?? values.guestContact, 254, 'Guest contact');
  const contactPreference = optionalText(
    values.contact_preference ?? values.contactMethod,
    10,
    'Contact preference'
  );
  const consentValue = values.consent_to_updates ?? values.consentToUpdates;
  const consent = consentValue === true || consentValue === 'true';
  if (guestContact && (!consent || !['sms', 'email'].includes(contactPreference))) {
    throw httpError(422, 'CONTACT_CONSENT_REQUIRED', 'Contact details require explicit consent and a valid contact method.');
  }
  if (contactPreference === 'sms' && guestContact && !/^[+0-9 ()-]{7,24}$/.test(guestContact)) {
    throw httpError(422, 'INVALID_CONTACT', 'The phone number is invalid.');
  }
  if (contactPreference === 'email' && guestContact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestContact)) {
    throw httpError(422, 'INVALID_CONTACT', 'The email address is invalid.');
  }

  return {
    idempotencyKey,
    category,
    description,
    address,
    organization,
    branch,
    latitude,
    longitude,
    gpsStatus: hasLatitude ? 'gps' : 'no_gps',
    evidence,
    guestContact,
    contactPreference,
    contactConsent: consent,
    deviceTimestamp: values.device_timestamp || values.deviceTimestamp || null
  };
}

function encodeHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(secret, value) {
  if (!secret) {
    throw httpError(503, 'REPORT_SERVICE_UNAVAILABLE', 'The reporting service is not configured.');
  }
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(value)));
}

async function makeLookupCode(secret, reportId) {
  const bytes = await hmac(secret, `guest-report-lookup-code:${reportId}`);
  let code = '';
  for (let i = 0; i < 10; i += 1) code += LOOKUP_ALPHABET[bytes[i] & 31];
  return code;
}

async function makeLookupHash(secret, code) {
  return encodeHex(await hmac(secret, `guest-report-lookup:${code}`));
}

export async function createGuestLookupCredentials(secret, reportId) {
  const code = await makeLookupCode(secret, reportId);
  return { code, hash: await makeLookupHash(secret, code) };
}

async function makeKeyHash(secret, scope, value) {
  return encodeHex(await hmac(secret, `${scope}:${value}`));
}

async function getValidatedUser(request, env, fetchImpl) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    throw httpError(401, 'AUTH_REQUIRED', 'Sign in before submitting a report.');
  }
  const projectUrl = env.get('SUPABASE_URL');
  const anonKey = env.get('SUPABASE_ANON_KEY');
  if (!projectUrl || !anonKey) {
    throw httpError(503, 'AUTH_UNAVAILABLE', 'Report authentication is not configured.');
  }
  const response = await fetchImpl(`${projectUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization }
  });
  if (!response.ok) throw httpError(401, 'AUTH_INVALID', 'Your session is invalid or has expired.');
  const user = await response.json();
  if (!user?.id) throw httpError(401, 'AUTH_INVALID', 'Your session could not be verified.');
  return user;
}

function isAnonymousUser(user) {
  return user.is_anonymous === true || user.app_metadata?.provider === 'anonymous';
}

function requireServiceConfig(env) {
  const projectUrl = env.get('SUPABASE_URL');
  const serviceRole = env.get('SUPABASE_SERVICE_ROLE_KEY') || env.get('SUPABASE_SERVICE_ROLE');
  if (!projectUrl || !serviceRole) {
    throw httpError(503, 'REPORT_SERVICE_UNAVAILABLE', 'Report storage is not configured.');
  }
  return { projectUrl: projectUrl.replace(/\/+$/, ''), serviceRole };
}

async function adminRequest(path, options, projectUrl, serviceRole, fetchImpl) {
  const response = await fetchImpl(`${projectUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      ...(options?.headers || {})
    }
  });
  return response;
}

async function getExistingReport(idempotencyKey, reporterId, config, fetchImpl) {
  const query = new URLSearchParams({
    select: 'id,tracking_number,status,report_level,ai_category,user_selected_category,created_at,source,reporter_type',
    idempotency_key: `eq.${idempotencyKey}`,
    reporter_id: `eq.${reporterId}`,
    limit: '1'
  });
  const response = await adminRequest(`reports?${query}`, {}, config.projectUrl, config.serviceRole, fetchImpl);
  if (!response.ok) throw httpError(503, 'REPORT_LOOKUP_FAILED', 'The report could not be verified.');
  const rows = await response.json();
  return rows[0] || null;
}

async function enforceRateLimits({ user, isGuest, request, secret, config, fetchImpl }) {
  const ip = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const userScope = isGuest ? 'guest-user-15m' : 'resident-user-15m';
  const ipScope = isGuest ? 'guest-ip-15m' : 'resident-ip-15m';
  const userLimit = isGuest ? 3 : 10;
  const ipLimit = isGuest ? 10 : 10;
  const windows = [
    [userScope, user.id, userLimit, 900],
    [ipScope, ip, ipLimit, 900]
  ];
  if (isGuest) windows.push(['guest-user-daily', user.id, 5, 86400]);

  for (const [scope, identity, limit, seconds] of windows) {
    const keyHash = await makeKeyHash(secret, scope, identity);
    const response = await adminRequest('rpc/consume_report_rate_limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_scope: scope,
        p_key_hash: keyHash,
        p_request_limit: limit,
        p_window_seconds: seconds
      })
    }, config.projectUrl, config.serviceRole, fetchImpl);
    if (!response.ok) {
      throw httpError(503, 'RATE_LIMIT_UNAVAILABLE', 'Report submission is temporarily unavailable.');
    }
    const result = await response.json();
    if (result?.allowed !== true) {
      throw httpError(429, 'REPORT_RATE_LIMITED', 'You have reached the report submission limit. Please try again later.');
    }
  }
}

function mimeExtension(mimeType) {
  const extensions = {
    'image/heic': 'heic', 'image/heif': 'heif', 'image/jpeg': 'jpg',
    'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/3gpp': '3gp', 'video/mp4': 'mp4',
    'video/quicktime': 'mov', 'video/webm': 'webm'
  };
  return extensions[mimeType] || 'bin';
}

async function uploadEvidence(items, reporterId, reportId, config, fetchImpl) {
  const uploaded = [];
  for (const item of items) {
    const path = `${reporterId}/${reportId}/${item.field}-${crypto.randomUUID()}.${mimeExtension(item.mimeType)}`;
    const response = await fetchImpl(`${config.projectUrl}/storage/v1/object/report-evidence/${path}`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRole,
        Authorization: `Bearer ${config.serviceRole}`,
        'Content-Type': item.mimeType,
        'x-upsert': 'false'
      },
      body: item.file
    });
    if (!response.ok) {
      const cleanupErrors = await deleteObjects(uploaded, config, fetchImpl);
      throw httpError(502, 'EVIDENCE_UPLOAD_FAILED', cleanupErrors.length
        ? 'Evidence upload failed and cleanup is incomplete.'
        : 'Evidence could not be uploaded.');
    }
    uploaded.push({
      kind: item.kind,
      bucket: 'report-evidence',
      path,
      mime_type: item.mimeType,
      size_bytes: item.file.size,
      duration_seconds: null
    });
  }
  return uploaded;
}

async function deleteObjects(evidence, config, fetchImpl) {
  const failures = [];
  for (const item of evidence) {
    try {
      const response = await fetchImpl(
        `${config.projectUrl}/storage/v1/object/${item.bucket}/${item.path}`,
      {
          method: 'DELETE',
        headers: { apikey: config.serviceRole, Authorization: `Bearer ${config.serviceRole}` }
      }
    );
      if (!response.ok && response.status !== 404) {
        failures.push(response.status);
        console.error('Report evidence cleanup failed.', {
          operation: 'storage_delete',
          status: response.status,
          code: 'STORAGE_DELETE_FAILED'
        });
      }
    } catch (error) {
      failures.push(null);
      console.error('Report evidence cleanup failed.', {
        operation: 'storage_delete',
        status: null,
        code: safeErrorCode(error?.name, 'STORAGE_DELETE_FAILED')
      });
    }
  }
  return failures;
}

async function removeFailedSubmission(reportId, evidence, config, fetchImpl) {
  let reportDeleted = true;
  if (reportId) {
    try {
      const response = await adminRequest(
        `reports?id=eq.${encodeURIComponent(reportId)}`,
        { method: 'DELETE' },
        config.projectUrl,
        config.serviceRole,
        fetchImpl
      );
      reportDeleted = response.ok || response.status === 404;
      if (!reportDeleted) {
        console.error('Report row cleanup failed.', {
          operation: 'report_delete',
          status: response.status,
          code: 'REPORT_DELETE_FAILED'
        });
      }
    } catch (error) {
      reportDeleted = false;
      console.error('Report row cleanup failed.', {
        operation: 'report_delete',
        status: null,
        code: safeErrorCode(error?.name, 'REPORT_DELETE_FAILED')
      });
    }
  }
  const objectFailures = await deleteObjects(evidence, config, fetchImpl);
  return !reportDeleted || objectFailures.length > 0;
}

async function insertEvidence(reportId, evidence, config, fetchImpl) {
  if (!evidence.length) return;
  const response = await adminRequest('report_evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(evidence.map((item) => ({ report_id: reportId, ...item })))
  }, config.projectUrl, config.serviceRole, fetchImpl);
  if (!response.ok) throw httpError(500, 'EVIDENCE_METADATA_FAILED', 'Evidence metadata could not be saved.');
}

async function insertGuestDetails(report, code, values, config, fetchImpl) {
  const secretHash = await makeLookupHash(values.lookupHmacKey, code);
  const secretResponse = await adminRequest('guest_report_lookup_secrets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ report_id: report.id, lookup_code_hash: secretHash })
  }, config.projectUrl, config.serviceRole, fetchImpl);
  if (!secretResponse.ok) throw httpError(500, 'GUEST_LOOKUP_SAVE_FAILED', 'Guest tracking could not be secured.');

  if (!values.report.guestContact) return;
  const contact = values.report.contactPreference === 'sms'
    ? { phone: values.report.guestContact, email: null }
    : { phone: null, email: values.report.guestContact };
  const contactResponse = await adminRequest('guest_contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      report_id: report.id,
      reporter_id: report.reporter_id,
      ...contact,
      contact_preference: values.report.contactPreference,
      consent_to_updates: true,
      consented_at: new Date().toISOString(),
      consent_policy_version: 'resident-app-v1'
    })
  }, config.projectUrl, config.serviceRole, fetchImpl);
  if (!contactResponse.ok) throw httpError(500, 'GUEST_CONTACT_SAVE_FAILED', 'Guest contact preferences could not be saved.');
}

function publicReceipt(report, lookupCode = null) {
  return {
    id: report.id,
    tracking_number: report.tracking_number,
    status: report.status,
    report_level: report.report_level,
    category: report.ai_category || report.user_selected_category || report.category,
    created_at: report.created_at,
    lookup_code: lookupCode
  };
}

async function processSubmission(request, context, expectedGuest) {
  const env = context.env || { get: () => '' };
  const fetchImpl = context.fetchImpl || fetch;
  const user = context.user || await getValidatedUser(request, env, fetchImpl);
  const isGuest = isAnonymousUser(user);
  if (expectedGuest !== isGuest) {
    throw httpError(403, 'ACCOUNT_TYPE_MISMATCH', 'This report submission route is unavailable for this account.');
  }

  const { values: rawValues, files } = await readRequest(request);
  const report = validateReport(rawValues, files);
  const config = requireServiceConfig(env);
  const lookupHmacKey = env.get('GUEST_LOOKUP_HMAC_KEY');

  const existing = await getExistingReport(report.idempotencyKey, user.id, config, fetchImpl);
  if (existing) {
    const code = isGuest ? await makeLookupCode(lookupHmacKey, existing.id) : null;
    return { receipt: publicReceipt(existing, code), idempotent_replay: true };
  }

  await enforceRateLimits({ user, isGuest, request, secret: lookupHmacKey || env.get('RATE_LIMIT_HMAC_KEY'), config, fetchImpl });

  const reportId = crypto.randomUUID();
  let code = null;
  if (isGuest) code = await makeLookupCode(lookupHmacKey, reportId);
  const evidence = await uploadEvidence(report.evidence, user.id, reportId, config, fetchImpl);
  const row = {
    id: reportId,
    reporter_id: user.id,
    reporter_type: isGuest ? 'guest' : 'resident',
    source: isGuest ? 'guest_report' : 'report_form',
    category: report.category,
    user_selected_category: report.category,
    description: report.description,
    description_original: report.description,
    description_english: report.description,
    user_reported_address: report.address,
    location_name: report.address,
    user_selected_organization: report.organization,
    user_selected_branch: report.branch,
    latitude: report.latitude,
    longitude: report.longitude,
    location_lat: report.latitude,
    location_lng: report.longitude,
    gps_status: report.gpsStatus,
    ...(report.latitude !== null ? {
      location: { type: 'Point', coordinates: [report.longitude, report.latitude] }
    } : {}),
    device_timestamp: report.deviceTimestamp || new Date().toISOString(),
    idempotency_key: report.idempotencyKey,
    needs_human_review: false,
    status: 'Pending Dispatch'
  };

  const createResponse = await adminRequest('reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row)
  }, config.projectUrl, config.serviceRole, fetchImpl);

  if (!createResponse.ok) {
    const cleanupFailed = await deleteObjects(evidence, config, fetchImpl);
    const backendError = await createResponse.clone().json().catch(() => ({}));
    const originalErrorCode = safeErrorCode(backendError?.code, 'REPORT_SAVE_FAILED');
    if (createResponse.status === 409 || createResponse.status === 400) {
      let duplicate = null;
      try {
        duplicate = await getExistingReport(report.idempotencyKey, user.id, config, fetchImpl);
      } catch (lookupError) {
        console.error('Idempotency lookup after report save failure failed.', {
          operation: 'idempotency_lookup',
          status: Number.isInteger(lookupError?.status) ? lookupError.status : null,
          code: safeErrorCode(lookupError?.code, 'REPORT_LOOKUP_FAILED')
        });
      }
      if (duplicate) {
        const duplicateCode = isGuest ? await makeLookupCode(lookupHmacKey, duplicate.id) : null;
        return { receipt: publicReceipt(duplicate, duplicateCode), idempotent_replay: true };
      }
    }
    const cleanupStatus = cleanupFailed ? 'incomplete' : 'complete';
    logSubmissionFailure('report_insert', originalErrorCode, createResponse.status, cleanupStatus);
    throw Object.assign(
      httpError(500, originalErrorCode, cleanupFailed
        ? 'The report could not be saved; evidence cleanup is incomplete.'
        : 'The report could not be saved.'),
      { cleanup_status: cleanupStatus, original_error_code: originalErrorCode }
    );
  }
  const rows = await createResponse.json();
  const saved = Array.isArray(rows) ? rows[0] : rows;

  try {
    await insertEvidence(reportId, evidence, config, fetchImpl);
    if (isGuest) {
      await insertGuestDetails(
        { ...saved, id: reportId, reporter_id: user.id },
        code,
        { lookupHmacKey, report },
        config,
        fetchImpl
      );
    }
  } catch (error) {
    const cleanupFailed = await removeFailedSubmission(reportId, evidence, config, fetchImpl);
    const cleanupStatus = cleanupFailed ? 'incomplete' : 'complete';
    const originalErrorCode = safeErrorCode(error?.code, 'REPORT_SUBMISSION_FAILED');
    logSubmissionFailure('post_insert', originalErrorCode, error?.status, cleanupStatus);
    if (cleanupFailed) {
      throw Object.assign(
        httpError(error?.status || 500, originalErrorCode, 'The report could not be completed; cleanup is incomplete.'),
        { cleanup_status: cleanupStatus, original_error_code: originalErrorCode }
      );
    }
    error.cleanup_status = cleanupStatus;
    error.original_error_code = originalErrorCode;
    throw error;
  }

  return { receipt: publicReceipt(saved, code), idempotent_replay: false };
}

export async function handleReportSubmission(request, context = {}, expectedGuest = false) {
  if (request.method === 'OPTIONS') return jsonResponse({ ok: true });
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Only POST is supported.' }, 405);
  }
  try {
    const result = await processSubmission(request, context, expectedGuest);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return jsonResponse({
      ok: false,
      code: error.code || 'REPORT_SUBMISSION_FAILED',
      message: error.message || 'The report could not be submitted.',
      ...(error.cleanup_status ? {
        cleanup_status: error.cleanup_status,
        original_error_code: error.original_error_code || error.code
      } : {})
    }, error.status || 500);
  }
}
