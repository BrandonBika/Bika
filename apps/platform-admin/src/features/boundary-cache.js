import { buildIndex, computeReportValues } from './boundary-lookup.js';
import { reportCoordinates } from './report-coordinates.js';

const boundaryReports = new Map();

export function cacheBoundaryLookup(path, reports, geojson, coordinateFn = reportCoordinates) {
  if (!path || !Array.isArray(reports) || typeof coordinateFn !== 'function') {
    throw new TypeError('Boundary lookup requires a path, reports array, and coordinate function.');
  }
  let reportsCache = boundaryReports.get(path);
  if (!reportsCache) {
    reportsCache = new WeakMap();
    boundaryReports.set(path, reportsCache);
  }
  if (reportsCache.has(reports)) return reportsCache.get(reports);

  const index = buildIndex(geojson);
  const reportValues = computeReportValues(index, reports, coordinateFn);
  const validCoordinateReports = new Set();
  for (const report of reports) {
    const coordinates = coordinateFn(report);
    const latitude = Array.isArray(coordinates) ? coordinates[0] : coordinates?.lat ?? coordinates?.latitude;
    const longitude = Array.isArray(coordinates) ? coordinates[1] : coordinates?.lng ?? coordinates?.longitude;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      validCoordinateReports.add(report.id);
    }
  }
  const entry = { index, reportValues, validCoordinateReports };
  reportsCache.set(reports, entry);
  return entry;
}

export function getBoundaryLookup(path, reports) {
  return boundaryReports.get(path)?.get(reports) ?? null;
}

export function boundaryEvaluationContext(path, reports) {
  const boundaryFeature = (report) => {
    const lookup = path ? getBoundaryLookup(path, reports) : null;
    // Undefined means invalid/missing coordinates; an empty array means a valid point outside all features.
    if (!lookup?.validCoordinateReports.has(report.id)) return undefined;
    return lookup.reportValues.get(report.id) ?? [];
  };
  return {
    boundaryFeature,
    boundaryValue: (key, report) => boundaryFeature(report)?.map((feature) => feature.properties?.[key] ?? null)
  };
}

export function invalidateBoundaryLookup(path) {
  boundaryReports.delete(path);
}
