/**
 * @file packages/query-builder/src/field-catalog.js
 */
export const fieldCatalog = {
  status: { type: 'string', operators: ['eq', 'neq', 'in'] },
  category: { type: 'string', operators: ['eq', 'neq', 'in'] },
  createdAt: { type: 'date', operators: ['gte', 'lte', 'eq'] }
};
