import {
  getCurrentUser,
  requestSupabase,
  subscribeToPostgresChanges
} from '@civicneuro/supabase-client';
import {
  BEACON_MAX_REDUCED_ACCURACY_METERS,
  watchCurrentLocation
} from './beacon-location.js';

const LIVE_SHARE_COLUMNS = [
  'id',
  'sharer_id',
  'recipient_id',
  'started_at',
  'expires_at',
  'stopped_at',
  'last_lat',
  'last_lng',
  'last_accuracy_m',
  'last_at',
  'planned_path'
].join(',');
const LIVE_SHARE_PATH_MAX_POINTS = 50;
const LIVE_SHARE_POLL_INTERVAL_MS = 10000;
const LIVE_SHARE_UPDATE_INTERVAL_MS = 10000;
const liveShareWatchers = new Map();

function requireUserId() {
  const userId = getCurrentUser()?.id;
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Sign in to use Beacon live sharing.');
  }
  return userId;
}

function requireId(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} is required.`);
  }
  return value.trim();
}

async function callRpc(name, args) {
  requireUserId();
  return requestSupabase(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: args,
    headers: { 'Content-Type': 'application/json' }
  });
}

function validateLocation(location) {
  if (
    !location
    || !Number.isFinite(location.lat)
    || location.lat < -90
    || location.lat > 90
    || !Number.isFinite(location.lng)
    || location.lng < -180
    || location.lng > 180
    || !Number.isFinite(location.accuracy)
    || location.accuracy < 0
    || location.accuracy > 5000
  ) {
    throw new TypeError('A valid live location and accuracy are required.');
  }
}

function normalizeLiveSharePath(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 5000) {
    throw new TypeError('A planned route must contain between 2 and 5000 points.');
  }
  return coordinates.map((point) => {
    if (Array.isArray(point) && point.length !== 2) {
      throw new TypeError('A planned route contains invalid coordinates.');
    }
    const lat = Array.isArray(point) ? point[0] : point?.lat;
    const lng = Array.isArray(point) ? point[1] : point?.lng;
    if (
      !Number.isFinite(lat) || lat < -90 || lat > 90
      || !Number.isFinite(lng) || lng < -180 || lng > 180
    ) {
      throw new TypeError('A planned route contains invalid coordinates.');
    }
    return [lat, lng];
  });
}

function simplifyPathAtTolerance(points, toleranceMeters) {
  if (points.length <= 2) return points;
  const referenceLatitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const metersPerLongitudeDegree = 111320 * Math.cos(referenceLatitude * Math.PI / 180);
  const toleranceSquared = toleranceMeters ** 2;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [firstIndex, lastIndex] = stack.pop();
    const first = points[firstIndex];
    const last = points[lastIndex];
    const dx = (last[1] - first[1]) * metersPerLongitudeDegree;
    const dy = (last[0] - first[0]) * 111320;
    const lengthSquared = dx * dx + dy * dy;
    let farthestIndex = -1;
    let farthestDistanceSquared = toleranceSquared;

    for (let index = firstIndex + 1; index < lastIndex; index += 1) {
      const point = points[index];
      const pointX = (point[1] - first[1]) * metersPerLongitudeDegree;
      const pointY = (point[0] - first[0]) * 111320;
      const progress = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, (pointX * dx + pointY * dy) / lengthSquared));
      const offsetX = pointX - progress * dx;
      const offsetY = pointY - progress * dy;
      const distanceSquared = offsetX * offsetX + offsetY * offsetY;
      if (distanceSquared > farthestDistanceSquared) {
        farthestDistanceSquared = distanceSquared;
        farthestIndex = index;
      }
    }

    if (farthestIndex >= 0) {
      keep[farthestIndex] = 1;
      stack.push([firstIndex, farthestIndex], [farthestIndex, lastIndex]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

export function simplifyLiveSharePath(coordinates) {
  const points = normalizeLiveSharePath(coordinates);
  if (points.length <= LIVE_SHARE_PATH_MAX_POINTS) return points;

  let toleranceMeters = 5;
  let simplified = simplifyPathAtTolerance(points, toleranceMeters);
  while (simplified.length > LIVE_SHARE_PATH_MAX_POINTS && toleranceMeters < 100000) {
    toleranceMeters *= 2;
    simplified = simplifyPathAtTolerance(points, toleranceMeters);
  }
  if (simplified.length <= LIVE_SHARE_PATH_MAX_POINTS) return simplified;

  const lastIndex = simplified.length - 1;
  return Array.from({ length: LIVE_SHARE_PATH_MAX_POINTS }, (_, index) => (
    simplified[Math.round(index * lastIndex / (LIVE_SHARE_PATH_MAX_POINTS - 1))]
  ));
}

function mapLiveShareRow(row) {
  if (
    !row
    || typeof row.id !== 'string'
    || typeof row.sharer_id !== 'string'
    || typeof row.recipient_id !== 'string'
    || typeof row.started_at !== 'string'
    || typeof row.expires_at !== 'string'
  ) {
    throw new Error('Supabase returned an invalid live share.');
  }
  return {
    id: row.id,
    sharerId: row.sharer_id,
    recipientId: row.recipient_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    stoppedAt: row.stopped_at,
    lastLat: row.last_lat,
    lastLng: row.last_lng,
    lastAccuracyM: row.last_accuracy_m,
    lastAt: row.last_at,
    plannedPath: row.planned_path
  };
}

async function fetchActiveShares(column, userId, expiresAfter) {
  const query = new URLSearchParams({
    select: LIVE_SHARE_COLUMNS,
    [column]: `eq.${userId}`,
    stopped_at: 'is.null',
    expires_at: `gt.${expiresAfter}`
  });
  const rows = await requestSupabase(`/rest/v1/live_location_shares?${query}`);
  if (!Array.isArray(rows)) {
    throw new Error('Supabase returned an invalid live-share list.');
  }
  return rows.map(mapLiveShareRow);
}

export async function startLiveShare(recipientId, minutes) {
  const userId = requireUserId();
  const recipient = requireId(recipientId, 'Recipient ID');
  if (recipient === userId) throw new TypeError('You cannot share with yourself.');
  if (!Number.isInteger(minutes)) throw new TypeError('A live-share duration is required.');
  const id = await callRpc('start_live_share', {
    p_recipient: recipient,
    p_minutes: minutes
  });
  if (typeof id !== 'string' || !id) {
    throw new Error('Supabase did not return the live-share ID.');
  }
  return id;
}

export async function updateLiveShare(shareId, location) {
  validateLocation(location);
  return callRpc('update_live_share', {
    p_id: requireId(shareId, 'Live share ID'),
    p_lat: location.lat,
    p_lng: location.lng,
    p_accuracy: location.accuracy
  });
}

export async function setLivePath(shareId, coordinates) {
  const path = coordinates === null ? null : simplifyLiveSharePath(coordinates);
  return callRpc('set_live_share_path', {
    p_id: requireId(shareId, 'Live share ID'),
    p_path: path
  });
}

export async function stopLiveShare(shareId) {
  const id = requireId(shareId, 'Live share ID');
  liveShareWatchers.get(id)?.stopLocal();
  return callRpc('stop_live_share', { p_id: id });
}

export function stopLiveShareLocationWatch(shareId) {
  const id = requireId(shareId, 'Live share ID');
  liveShareWatchers.get(id)?.stopLocal();
}

export async function getActiveSharesForMe() {
  const userId = requireUserId();
  const expiresAfter = new Date().toISOString();
  const [asSharer, asRecipient] = await Promise.all([
    fetchActiveShares('sharer_id', userId, expiresAfter),
    fetchActiveShares('recipient_id', userId, expiresAfter)
  ]);
  return [...new Map([...asSharer, ...asRecipient].map((share) => [share.id, share])).values()];
}

export function subscribeToLiveShares(onChange, onError = console.error) {
  const userId = requireUserId();
  if (typeof onChange !== 'function') {
    throw new TypeError('A live-share change callback is required.');
  }
  if (typeof onError !== 'function') {
    throw new TypeError('A live-share error callback is required.');
  }

  let closed = false;
  const refresh = () => {
    getActiveSharesForMe().then((shares) => {
      if (!closed) onChange(shares);
    }).catch(onError);
  };
  const subscription = subscribeToPostgresChanges({
    topic: `live-location-shares:${userId}`,
    changes: [{
      event: '*',
      schema: 'public',
      table: 'live_location_shares',
      filter: `recipient_id=eq.${userId}`
    }],
    onChange: refresh,
    onError,
    onSubscribed: refresh
  });
  const pollTimer = setInterval(refresh, LIVE_SHARE_POLL_INTERVAL_MS);
  refresh();

  return {
    ready: subscription.ready,
    unsubscribe() {
      if (closed) return;
      closed = true;
      clearInterval(pollTimer);
      subscription.unsubscribe();
    }
  };
}

export function watchLiveShareLocation(share, onError = console.error) {
  const id = requireId(share?.id, 'Live share ID');
  if (typeof onError !== 'function') throw new TypeError('A live-share error callback is required.');
  const expiresAt = Date.parse(share.expiresAt);
  if (!Number.isFinite(expiresAt)) throw new TypeError('A valid live-share expiry is required.');
  if (liveShareWatchers.has(id)) throw new Error('Live-share location watch is already active.');

  let stopped = false;
  let stopWatch = null;
  let expiryTimer = null;
  let lastUpdateAt = Number.NEGATIVE_INFINITY;
  let updateInFlight = false;

  const removeListeners = () => {
    globalThis.document?.removeEventListener?.('visibilitychange', onVisibilityChange);
    globalThis.window?.removeEventListener?.('pagehide', onPageHide);
  };
  const stopLocal = () => {
    if (stopped) return false;
    stopped = true;
    clearTimeout(expiryTimer);
    expiryTimer = null;
    stopWatch?.();
    stopWatch = null;
    removeListeners();
    liveShareWatchers.delete(id);
    return true;
  };
  const endShare = () => {
    if (!stopLocal()) return;
    callRpc('stop_live_share', { p_id: id }).catch(onError);
  };
  const onVisibilityChange = () => {
    if (globalThis.document?.hidden) endShare();
  };
  const onPageHide = () => endShare();
  const onLocationError = (error) => {
    try {
      onError(error);
    } finally {
      endShare();
    }
  };
  const onLocationFix = (location) => {
    if (
      stopped
      || Date.now() >= expiresAt
      || location.accuracy > BEACON_MAX_REDUCED_ACCURACY_METERS
      || updateInFlight
      || Date.now() - lastUpdateAt < LIVE_SHARE_UPDATE_INTERVAL_MS
    ) return;

    lastUpdateAt = Date.now();
    updateInFlight = true;
    updateLiveShare(id, location).catch(onError).finally(() => {
      updateInFlight = false;
    });
  };

  if (expiresAt <= Date.now()) {
    callRpc('stop_live_share', { p_id: id }).catch(onError);
    return () => {};
  }

  liveShareWatchers.set(id, { stopLocal });
  expiryTimer = setTimeout(endShare, expiresAt - Date.now());
  globalThis.document?.addEventListener?.('visibilitychange', onVisibilityChange);
  globalThis.window?.addEventListener?.('pagehide', onPageHide);
  if (globalThis.document?.hidden) {
    endShare();
    return () => {};
  }

  try {
    stopWatch = watchCurrentLocation(onLocationError, { onLocationFix });
  } catch (error) {
    stopLocal();
    throw error;
  }
  return endShare;
}
