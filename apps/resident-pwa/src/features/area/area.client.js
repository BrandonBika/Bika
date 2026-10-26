import { ReportCategoryDefinitions } from '../../../../../packages/config/src/enums.js';
import {
  getCurrentUser,
  requestSupabase
} from '@civicneuro/supabase-client';
import { areaStore } from './area.store.js';

const AREA_INSIGHTS_CACHE_MS = 5 * 60 * 1000;
let cacheExpiresAt = 0;
let cacheUserId = null;
let stateUserId = null;
let cacheVersion = 0;
let pendingRefresh = null;

function requireUserId() {
  const userId = getCurrentUser()?.id;
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Sign in to use area insights.');
  }
  return userId;
}

async function callRpc(name, body = {}) {
  requireUserId();
  return requestSupabase(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' }
  });
}

function mapInsightResponse(response) {
  if (!response || !['ok', 'no_area', 'insufficient'].includes(response.state)) {
    throw new Error('Area insights returned an invalid response.');
  }
  const trending = response.trending;
  const pulse = response.pulse;
  if (trending !== null && trending !== undefined
      && (typeof trending.category !== 'string'
        || typeof trending.count !== 'number'
        || !Number.isInteger(trending.count)
        || trending.count < 0)) {
    throw new Error('Area trending data is invalid.');
  }
  if (pulse !== null && pulse !== undefined
      && (typeof pulse.resolved_pct !== 'number'
        || !Number.isInteger(pulse.resolved_pct)
        || pulse.resolved_pct < 0
        || pulse.resolved_pct > 100
        || typeof pulse.total !== 'number'
        || !Number.isInteger(pulse.total)
        || pulse.total <= 0)) {
    throw new Error('Area pulse data is invalid.');
  }
  if (typeof response.window_days !== 'number'
      || !Number.isInteger(response.window_days)
      || typeof response.radius_m !== 'number'
      || !Number.isInteger(response.radius_m)) {
    throw new Error('Area insight window or radius is invalid.');
  }
  return {
    status: response.state,
    trending: trending ? {
      category: categoryDisplayLabel(trending.category),
      count: Number(trending.count)
    } : null,
    pulse: pulse ? {
      resolved_pct: Number(pulse.resolved_pct),
      total: Number(pulse.total)
    } : null,
    windowDays: Number(response.window_days),
    radiusM: Number(response.radius_m),
    homeAreaSet: response.state !== 'no_area'
  };
}

export function categoryDisplayLabel(category) {
  const normalized = String(category || '').trim().toLowerCase();
  const definition = ReportCategoryDefinitions.find(({ value, label }) => (
    value.toLowerCase() === normalized || label.toLowerCase() === normalized
  ));
  if (definition) return definition.label;
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export async function refreshAreaInsights({ force = false } = {}) {
  const userId = requireUserId();
  if (!force && cacheUserId === userId && Date.now() < cacheExpiresAt) {
    return areaStore.get();
  }
  if (pendingRefresh && pendingRefresh.userId !== userId) {
    invalidateAreaInsights();
  }
  if (pendingRefresh?.userId === userId && pendingRefresh.version === cacheVersion) {
    return pendingRefresh.promise;
  }

  const isDifferentUser = stateUserId !== null && stateUserId !== userId;
  areaStore.update((state) => ({
    ...state,
    status: 'loading',
    ...(isDifferentUser ? {
      trending: null,
      pulse: null,
      homeAreaSet: null
    } : {}),
    isLoading: true,
    error: null
  }));
  const version = cacheVersion;
  const promise = callRpc('get_area_insights', { p_days: 7 })
    .then(mapInsightResponse)
    .then((insights) => {
      if (version !== cacheVersion) return areaStore.get();
      cacheUserId = userId;
      stateUserId = userId;
      cacheExpiresAt = Date.now() + AREA_INSIGHTS_CACHE_MS;
      areaStore.update((state) => ({ ...state, ...insights, isLoading: false, error: null }));
      return areaStore.get();
    })
    .catch((error) => {
      if (version !== cacheVersion) throw error;
      cacheExpiresAt = 0;
      areaStore.update((state) => ({
        ...state,
        status: 'error',
        isLoading: false,
        error
      }));
      throw error;
    })
    .finally(() => {
      if (pendingRefresh?.promise === promise) pendingRefresh = null;
    });
  pendingRefresh = { userId, version, promise };
  return promise;
}

function invalidateAreaInsights() {
  cacheVersion += 1;
  cacheExpiresAt = 0;
  cacheUserId = null;
}

function validateCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError('Choose a valid location.');
  }
}

export async function setHomeLocation(latitude, longitude) {
  validateCoordinates(latitude, longitude);
  await callRpc('set_home_location', { p_lat: latitude, p_lng: longitude });
  invalidateAreaInsights();
  areaStore.update((state) => ({ ...state, homeAreaSet: true }));
  return refreshAreaInsights({ force: true });
}

export async function clearHomeLocation() {
  await callRpc('clear_home_location');
  invalidateAreaInsights();
  areaStore.update((state) => ({ ...state, homeAreaSet: false }));
  return refreshAreaInsights({ force: true });
}
