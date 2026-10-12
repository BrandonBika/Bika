import { requestSupabase } from './client.js';

const PROFILE_COLUMNS = 'id,full_name,email,phone,address,report_status_updates_sms,community_safety_alerts,ward_councillor_bulletins,beacon_circle_requests';
const PROFILE_UPDATE_COLUMNS = new Set(['full_name', 'phone', 'address']);
const PREFERENCE_COLUMNS = new Set([
  'report_status_updates_sms',
  'community_safety_alerts',
  'ward_councillor_bulletins',
  'beacon_circle_requests'
]);

function requireOwnerId(ownerId) {
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new Error('Sign in to manage your resident profile.');
  }
  return ownerId;
}

function profileQuery(ownerId) {
  return new URLSearchParams({
    id: `eq.${requireOwnerId(ownerId)}`,
    select: PROFILE_COLUMNS
  });
}

async function updateProfile(ownerId, values, allowedColumns, errorMessage) {
  const validatedOwnerId = requireOwnerId(ownerId);
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new TypeError('Profile changes must be an object.');
  }

  const body = {};
  for (const [column, value] of Object.entries(values)) {
    if (!allowedColumns.has(column)) {
      throw new TypeError(`Unsupported resident profile field: ${column}`);
    }
    if (column === 'phone') {
      const digits = String(value).replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        throw new TypeError('Enter a valid phone number.');
      }
      body[column] = digits;
    } else if (typeof value === 'boolean' && PREFERENCE_COLUMNS.has(column)) {
      body[column] = value;
    } else if (typeof value === 'string' && value.trim()) {
      body[column] = value.trim();
    } else {
      throw new TypeError(`A valid value is required for ${column}.`);
    }
  }

  if (Object.keys(body).length === 0) return null;
  const query = profileQuery(validatedOwnerId);
  const rows = await requestSupabase(`/rest/v1/resident_profiles?${query}`, {
    method: 'PATCH',
    body,
    headers: { Prefer: 'return=representation' }
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(errorMessage);
  }
  return rows[0];
}

export async function getResidentProfile(ownerId) {
  const rows = await requestSupabase(`/rest/v1/resident_profiles?${profileQuery(ownerId)}`);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('Your resident profile could not be loaded.');
  }
  return rows[0];
}

export async function updateResidentProfile(ownerId, values) {
  return updateProfile(
    ownerId,
    values,
    PROFILE_UPDATE_COLUMNS,
    'Your resident profile could not be updated. Refresh and try again.'
  );
}

export async function updateResidentPreferences(ownerId, values) {
  return updateProfile(
    ownerId,
    values,
    PREFERENCE_COLUMNS,
    'Your notification preferences could not be updated. Refresh and try again.'
  );
}
