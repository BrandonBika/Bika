export function reportCoordinates(report) {
  const latitude = coordinate(report?.latitude, report?.location_lat);
  const longitude = coordinate(report?.longitude, report?.location_lng);
  if (latitude === null || longitude === null
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return [latitude, longitude];
}

function coordinate(primary, fallback) {
  const value = primary ?? fallback;
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
