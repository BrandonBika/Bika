export function pointInFeature(lon, lat, geometry) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !geometry) return false;
  const bbox = geometryBounds(geometry);
  if (!bbox || !inBounds(lon, lat, bbox)) return false;
  return pointInFeatureGeometry(lon, lat, geometry);
}

function pointInFeatureGeometry(lon, lat, geometry) {
  if (geometry.type === 'Polygon') return pointInPolygonGeometry(lon, lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates ?? []).some((polygon) => pointInPolygonGeometry(lon, lat, polygon));
  }
  return false;
}

export function buildIndex(featureCollection) {
  const features = featureCollection?.type === 'FeatureCollection'
    ? featureCollection.features ?? []
    : [];
  return features.map((feature) => ({
    feature,
    bbox: geometryBounds(feature?.geometry)
  }));
}

export function findFeature(index, lat, lng) {
  return findAllFeatures(index, lat, lng)[0] ?? null;
}

export function findAllFeatures(index, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const matches = [];
  for (const entry of index ?? []) {
    if (!entry.bbox || !inBounds(lng, lat, entry.bbox)) continue;
    if (pointInFeatureGeometry(lng, lat, entry.feature?.geometry)) matches.push(entry.feature);
  }
  return matches;
}

export function computeReportValues(index, reports, coordinateFn) {
  const values = new Map();
  for (const report of reports ?? []) {
    const coordinates = coordinateFn(report);
    if (!coordinates) {
      values.set(report.id, null);
      continue;
    }
    const lat = Array.isArray(coordinates) ? coordinates[0] : coordinates?.lat ?? coordinates?.latitude;
    const lng = Array.isArray(coordinates) ? coordinates[1] : coordinates?.lng ?? coordinates?.longitude;
    // Report and Leaflet coordinates are [lat, lng]; findAllFeatures converts them to GeoJSON [lng, lat].
    const valid = Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    values.set(report.id, valid ? findAllFeatures(index, lat, lng) : null);
  }
  return values;
}

export function discoverFields(featureCollection) {
  const features = featureCollection?.type === 'FeatureCollection'
    ? featureCollection.features ?? []
    : [];
  const keys = new Set(features.flatMap((feature) => Object.keys(feature?.properties ?? {})));
  const fields = [];
  for (const key of keys) {
    if (/^(OBJECTID|FID|SHAPE|Shape_)/i.test(key)) continue;
    const values = [];
    let type = null;
    let unsupported = false;
    for (const feature of features) {
      const value = feature?.properties?.[key];
      if (value === null || value === undefined) continue;
      const valueType = Number.isInteger(value) ? 'integer' : typeof value === 'string' ? 'string' : null;
      if (!valueType || (type && type !== valueType)) {
        unsupported = true;
        break;
      }
      type = valueType;
      if (!values.some((item) => Object.is(item, value))) values.push(value);
    }
    if (unsupported || values.length < 2) continue;
    values.sort(type === 'integer'
      ? (left, right) => left - right
      : (left, right) => String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' }));
    fields.push({ key, label: readableLabel(key), type, values });
  }
  return fields.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }));
}

function pointInPolygonGeometry(lon, lat, rings) {
  if (!Array.isArray(rings) || !rings.length) return false;
  const exterior = ringRelation(lon, lat, rings[0]);
  if (exterior < 0) return false;
  if (exterior === 0) return true;
  for (const hole of rings.slice(1)) {
    const relation = ringRelation(lon, lat, hole);
    if (relation === 0) return true;
    if (relation > 0) return false;
  }
  return true;
}

function ringRelation(lon, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return -1;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] ?? [];
    const [xj, yj] = ring[j] ?? [];
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const cross = (lon - xi) * (yj - yi) - (lat - yi) * (xj - xi);
    if (cross === 0 && lon >= Math.min(xi, xj) && lon <= Math.max(xi, xj)
      && lat >= Math.min(yi, yj) && lat <= Math.max(yi, yj)) return 0;
    const intersects = (yi > lat) !== (yj > lat)
      && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside ? 1 : -1;
}

function geometryBounds(geometry) {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return null;
  return boundsFromPositions(geometry.coordinates);
}

function boundsFromPositions(value) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  collectPositions(value, (lon, lat) => {
    bounds[0] = Math.min(bounds[0], lon);
    bounds[1] = Math.min(bounds[1], lat);
    bounds[2] = Math.max(bounds[2], lon);
    bounds[3] = Math.max(bounds[3], lat);
  });
  return Number.isFinite(bounds[0]) ? bounds : null;
}

function collectPositions(value, visit) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    visit(value[0], value[1]);
    return;
  }
  for (const child of value) collectPositions(child, visit);
}

function inBounds(lon, lat, [minLon, minLat, maxLon, maxLat]) {
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

function readableLabel(key) {
  const sections = String(key).split('_').filter(Boolean);
  return sections.flatMap((section, sectionIndex) => {
    const words = section
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
      .split(/\s+/)
      .filter(Boolean);
    return words.map((word, wordIndex) => {
      const normalized = word.toLocaleLowerCase();
      return sectionIndex === 0 || wordIndex > 0
        ? normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1)
        : normalized;
    });
  }).join(' ');
}
