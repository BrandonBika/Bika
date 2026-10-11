/**
 * @file packages/query-builder/src/validate.js
 */
export function validateQueryState(state) {
  return !!state && Array.isArray(state.conditions);
}
