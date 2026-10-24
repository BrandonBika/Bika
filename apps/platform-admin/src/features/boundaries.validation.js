import { isValidCoordinate } from '../../../../packages/geo/src/index.js';

const MAX_FEATURES = 5000;
const POLYGON_TYPES = new Set(['Polygon', 'MultiPolygon']);

export function validateBoundaryFile(file) {
  if (!file || !/\.geojson$/i.test(file.name ?? '')) {
    throw new Error('Only .geojson files are accepted');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Boundary files must be 5 MB or smaller');
  }
  return validateBoundaryContent(file.text());
}

export async function validateBoundaryContent(content) {
  const source = await content;
  let input;
  try {
    input = typeof source === 'string' ? JSON.parse(source) : source;
  } catch {
    throw new Error('The boundary file is not valid JSON');
  }

  const warnings = [];
  const features = toFeatures(input);
  if (features.length > MAX_FEATURES) {
    throw new Error('Boundary files cannot contain more than 5000 features');
  }

  const polygonFeatures = [];
  for (const [index, feature] of features.entries()) {
    const geometry = feature?.geometry;
    if (!geometry || !POLYGON_TYPES.has(geometry.type)) continue;
    validateCoordinates(geometry.coordinates, warnings, index + 1);
    polygonFeatures.push({
      ...feature,
      type: 'Feature',
      properties: feature.properties && typeof feature.properties === 'object'
        ? feature.properties
        : {},
      geometry
    });
  }
  if (!polygonFeatures.length) {
    throw new Error('The file must contain at least one Polygon or MultiPolygon feature');
  }
  return {
    geojson: { type: 'FeatureCollection', features: polygonFeatures },
    featureCount: polygonFeatures.length,
    warnings: [...new Set(warnings)]
  };
}

function toFeatures(input) {
  if (input?.type === 'FeatureCollection' && Array.isArray(input.features)) {
    return input.features;
  }
  if (input?.type === 'Feature') return [input];
  if (POLYGON_TYPES.has(input?.type)) {
    return [{ type: 'Feature', properties: {}, geometry: input }];
  }
  throw new Error('The file must be a FeatureCollection, Feature, Polygon, or MultiPolygon');
}

function validateCoordinates(coordinates, warnings, featureNumber) {
  const positions = [];
  collectPositions(coordinates, positions);
  if (!positions.length) throw new Error(`Feature ${featureNumber} has no coordinates`);

  for (const [longitude, latitude] of positions) {
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      throw new Error(`Feature ${featureNumber} coordinates must be numbers`);
    }
    if (!isValidCoordinate(latitude, longitude)) {
      if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
        const warning = 'looks projected; re-export as WGS84 lon/lat';
        warnings.push(`Feature ${featureNumber} ${warning}`);
        throw new Error(
          `Feature ${featureNumber} has coordinates outside longitude/latitude ranges; ${warning}.`
        );
      }
      throw new Error(`Feature ${featureNumber} has coordinates outside longitude/latitude ranges`);
    }
  }
}

function collectPositions(value, positions) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    positions.push(value);
    return;
  }
  for (const child of value) collectPositions(child, positions);
}
