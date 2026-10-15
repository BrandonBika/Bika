const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const MAX_SEARCH_LENGTH = 120;
const MAX_ROUTE_METERS = 10000;
const MIN_ROUTE_METERS = 100;
const UPSTREAM_TIMEOUT_MS = 8000;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function readServiceUrl(value, serviceName) {
  if (!value) throw Object.assign(new Error(`${serviceName} is not configured`), { status: 503 });
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error(`${serviceName} configuration is invalid`), { status: 503 });
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    throw Object.assign(new Error(`${serviceName} must use HTTPS`), { status: 503 });
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url;
}

function validCoordinate(value) {
  return value
    && Number.isFinite(value.lat)
    && value.lat >= -90
    && value.lat <= 90
    && Number.isFinite(value.lng)
    && value.lng >= -180
    && value.lng <= 180;
}

function simplifyRoute(points, toleranceMeters = 5) {
  if (points.length <= 2) return points;
  const referenceLatitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const metersPerLatitudeDegree = 111320;
  const metersPerLongitudeDegree = metersPerLatitudeDegree * Math.cos(referenceLatitude * Math.PI / 180);
  const squaredTolerance = toleranceMeters ** 2;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [firstIndex, lastIndex] = stack.pop();
    const first = points[firstIndex];
    const last = points[lastIndex];
    const dx = (last[1] - first[1]) * metersPerLongitudeDegree;
    const dy = (last[0] - first[0]) * metersPerLatitudeDegree;
    const segmentLengthSquared = dx * dx + dy * dy;
    let maximumDistance = squaredTolerance;
    let farthestIndex = -1;

    for (let index = firstIndex + 1; index < lastIndex; index++) {
      const point = points[index];
      const pointX = (point[1] - first[1]) * metersPerLongitudeDegree;
      const pointY = (point[0] - first[0]) * metersPerLatitudeDegree;
      const progress = segmentLengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, (pointX * dx + pointY * dy) / segmentLengthSquared));
      const offsetX = pointX - progress * dx;
      const offsetY = pointY - progress * dy;
      const distanceSquared = offsetX * offsetX + offsetY * offsetY;
      if (distanceSquared > maximumDistance) {
        maximumDistance = distanceSquared;
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

function limitRoutePoints(points, maxPoints = 500) {
  const simplified = simplifyRoute(points);
  if (simplified.length <= maxPoints) return simplified;
  const lastIndex = simplified.length - 1;
  return Array.from({ length: maxPoints }, (_, index) => (
    simplified[Math.round((index * lastIndex) / (maxPoints - 1))]
  ));
}

async function fetchJson(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal
    });
    if (!response.ok) {
      throw Object.assign(new Error('The configured location service returned an error'), { status: 502 });
    }
    try {
      return await response.json();
    } catch {
      throw Object.assign(new Error('The configured location service returned invalid data'), { status: 502 });
    }
  } catch (error) {
    if (error?.status) throw error;
    throw Object.assign(
      new Error(error?.name === 'AbortError'
        ? 'The configured location service timed out'
        : 'The configured location service is unavailable'),
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function authenticate(request, env, fetchImpl) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = env.get('SUPABASE_URL');
  const apiKey = env.get('SUPABASE_ANON_KEY') || env.get('SUPABASE_PUBLISHABLE_KEY');
  if (!token) return false;
  if (!supabaseUrl || !apiKey) {
    throw Object.assign(new Error('Authentication is not configured'), { status: 503 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL('/auth/v1/user', supabaseUrl), {
      headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) return false;
    if (!response.ok) {
      throw Object.assign(new Error('Authentication could not be verified'), { status: 503 });
    }
    const user = await response.json();
    return Boolean(user && typeof user.id === 'string');
  } catch (error) {
    if (error?.status) throw error;
    throw Object.assign(new Error('Authentication could not be verified'), { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}

async function searchPlaces(query, env, fetchImpl) {
  const geocoderUrl = readServiceUrl(env.get('BEACON_GEOCODER_URL'), 'Beacon geocoder');
  const url = new URL('search', geocoderUrl);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('q', query);
  const results = await fetchJson(fetchImpl, url, { headers: { Accept: 'application/json' } });
  if (!Array.isArray(results)) {
    throw Object.assign(new Error('The configured geocoder returned invalid data'), { status: 502 });
  }
  const places = results.slice(0, 5).flatMap((result) => {
    const lat = Number(result.lat);
    const lng = Number(result.lon);
    if (
      !Number.isFinite(lat)
      || lat < -90
      || lat > 90
      || !Number.isFinite(lng)
      || lng < -180
      || lng > 180
      || !result.display_name
    ) return [];
    return [{
      id: `${lat},${lng}`,
      name: String(result.display_name).slice(0, 180),
      lat,
      lng
    }];
  });
  return { places };
}

async function getRoute(origin, destination, env, fetchImpl) {
  const routingUrl = readServiceUrl(env.get('BEACON_ROUTING_URL'), 'Beacon routing service');
  const profile = env.get('BEACON_ROUTING_PROFILE') || 'foot';
  if (!/^[a-z0-9_-]{1,24}$/i.test(profile)) {
    throw Object.assign(new Error('Beacon routing profile configuration is invalid'), { status: 503 });
  }
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = new URL(`route/v1/${profile}/${coordinates}`, routingUrl);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');

  const result = await fetchJson(fetchImpl, url, { headers: { Accept: 'application/json' } });
  const route = result?.routes?.[0];
  const routeCoordinates = route?.geometry?.coordinates;
  if (result?.code !== 'Ok' || !Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    throw Object.assign(new Error('No walking route could be found for that destination'), { status: 422 });
  }
  const distanceMeters = Number(route.distance);
  const durationSeconds = Number(route.duration);
  if (
    !Number.isFinite(distanceMeters)
    || distanceMeters < MIN_ROUTE_METERS
    || distanceMeters > MAX_ROUTE_METERS
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
    || !routeCoordinates.every((point) => (
      Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(point[0])
      && point[0] >= -180
      && point[0] <= 180
      && Number.isFinite(point[1])
      && point[1] >= -90
      && point[1] <= 90
    ))
  ) {
    throw Object.assign(new Error('The route must be between 100 m and 10 km and contain valid coordinates'), { status: 422 });
  }
  return {
    coordinates: limitRoutePoints(routeCoordinates.map(([lng, lat]) => [lat, lng])),
    distanceMeters,
    durationSeconds
  };
}

export async function handleBeaconRoute(request, { env, fetchImpl = fetch } = {}) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST for Beacon route requests' }, 405);
  }

  try {
    if (!env || !(await authenticate(request, env, fetchImpl))) {
      return jsonResponse({ code: 'UNAUTHORIZED', message: 'Sign in to search places and plan a Beacon route' }, 401);
    }
    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ code: 'INVALID_JSON', message: 'The route request must contain valid JSON' }, 400);
    }

    if (payload?.operation === 'search') {
      const query = typeof payload.query === 'string' ? payload.query.trim() : '';
      if (query.length < 2 || query.length > MAX_SEARCH_LENGTH) {
        return jsonResponse({ code: 'INVALID_QUERY', message: 'Search text must be between 2 and 120 characters' }, 400);
      }
      return jsonResponse(await searchPlaces(query, env, fetchImpl));
    }
    if (payload?.operation === 'route') {
      if (!validCoordinate(payload.origin) || !validCoordinate(payload.destination)) {
        return jsonResponse({ code: 'INVALID_COORDINATES', message: 'A valid starting point and destination are required' }, 400);
      }
      return jsonResponse(await getRoute(payload.origin, payload.destination, env, fetchImpl));
    }
    return jsonResponse({ code: 'INVALID_OPERATION', message: 'Choose a place search or route request' }, 400);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 502;
    return jsonResponse({
      code: status === 503 ? 'ROUTING_NOT_CONFIGURED' : 'ROUTE_SERVICE_ERROR',
      message: error?.message || 'The Beacon route service could not complete the request'
    }, status);
  }
}
