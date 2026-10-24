/**
 * @file packages/supabase-client/src/client.js
 */
import * as auth from './auth.js';
import { getAccessToken, getRefreshToken, refreshSession } from './auth.js';
import * as realtime from './realtime.js';
import * as storage from './storage.js';

let supabaseUrl = '';
let supabaseAnonKey = '';

export function configureSupabaseClient({ url, anonKey }) {
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured. Set the project URL and anon key in resident-pwa/runtime-config.js.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('The configured Supabase project URL is invalid.');
  }
  if (parsedUrl.protocol !== 'https:' &&
      !(parsedUrl.protocol === 'http:' && parsedUrl.hostname === 'localhost')) {
    throw new Error('The Supabase project URL must use HTTPS.');
  }

  supabaseUrl = parsedUrl.origin;
  supabaseAnonKey = anonKey;
  realtime.configureRealtimeClient({
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    getAccessToken
  });
}

export async function requestSupabase(path, { method = 'GET', body, headers = {}, auth: useAuth = true, retryAuth = true } = {}) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set the project URL and anon key in resident-pwa/runtime-config.js.');
  }

  const requestHeaders = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${useAuth ? (auth.getAccessToken() || supabaseAnonKey) : supabaseAnonKey}`,
    ...headers
  };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(new URL(path, supabaseUrl), {
      method,
      headers: requestHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    throw new Error(`Could not reach Supabase: ${error.message}`);
  }

  const text = await response.text();
  let result = null;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }
  }
  if (!response.ok) {
    if (response.status === 401 && useAuth && retryAuth && getRefreshToken()) {
      await refreshSession();
      return requestSupabase(path, { method, body, headers, auth: useAuth, retryAuth: false });
    }
    const message = result?.msg || result?.message || result?.error_description || result?.error || `Supabase request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.code = result?.code || result?.error_code;
    throw error;
  }
  return result;
}

export async function selectRows(table, filters = {}, columns = '*') {
  const query = new URLSearchParams({ select: columns });
  for (const [column, value] of Object.entries(filters)) {
    query.set(column, `eq.${value}`);
  }
  return requestSupabase(`/rest/v1/${encodeURIComponent(table)}?${query}`);
}

export const supabase = {
  auth,
  realtime,
  storage,
  selectRows
};
