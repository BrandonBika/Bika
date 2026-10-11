/**
 * @file packages/geo/src/point-in-polygon.js
 * Ray-casting algorithm for point-in-polygon check.
 */
export function pointInPolygon(point, polygonCoords) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const [xi, yi] = polygonCoords[i];
    const [xj, yj] = polygonCoords[j];
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
