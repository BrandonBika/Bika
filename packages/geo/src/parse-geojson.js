/**
 * @file packages/geo/src/parse-geojson.js
 */
export function parseGeoJsonSafe(jsonStr) {
  try {
    const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    if (!obj || !obj.type) throw new Error('Invalid GeoJSON');
    return obj;
  } catch (e) {
    return null;
  }
}
