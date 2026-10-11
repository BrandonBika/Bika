/**
 * @file packages/query-builder/src/compile-attribute.js
 */
export function compileAttributeCondition(condition) {
  return `${condition.field} ${condition.op} ${JSON.stringify(condition.value)}`;
}
