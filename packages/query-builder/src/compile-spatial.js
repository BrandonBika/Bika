/**
 * @file packages/query-builder/src/compile-spatial.js
 */
export function compileSpatialCondition(condition) {
  return `ST_DWithin(location, ST_Point(${condition.lng}, ${condition.lat}), ${condition.radius})`;
}
