/**
 * @file packages/geo/src/validate-geometry.js
 */
export function isValidCoordinate(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function isSouthAfricaCoordinate(lat, lng) {
  return isValidCoordinate(lat, lng) &&
    lat >= -35.5 && lat <= -22.0 && lng >= 16.0 && lng <= 33.5;
}
