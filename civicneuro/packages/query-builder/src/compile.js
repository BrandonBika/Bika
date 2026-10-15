/**
 * @file packages/query-builder/src/compile.js
 */
import { compileAttributeCondition } from './compile-attribute.js';

export function compileQuery(state) {
  if (!state || !state.conditions || state.conditions.length === 0) {
    return '1=1';
  }
  return state.conditions.map(compileAttributeCondition).join(` ${state.combinator || 'AND'} `);
}
