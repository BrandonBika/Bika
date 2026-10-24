export const ATTENDED_STATUSES = new Set(['Resolved', 'Rejected', 'Duplicate']);

function coordinate(primary, fallback) {
  const value = primary ?? fallback;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function isMapVisible(report) {
  return !ATTENDED_STATUSES.has(report.status)
    && coordinate(report.latitude, report.location_lat) !== null
    && coordinate(report.longitude, report.location_lng) !== null;
}

export function mapPinState(report) {
  return isMapVisible(report) ? 'Shown' : 'Hidden';
}
