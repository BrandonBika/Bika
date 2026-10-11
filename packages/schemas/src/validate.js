/**
 * @file packages/schemas/src/validate.js
 * @description Lightweight validator for runtime shapes.
 */

export class ValidationError extends Error {
  /**
   * @param {string} field
   * @param {string} message
   */
  constructor(field, message) {
    super(`Validation error on ${field}: ${message}`);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validates an object against a schema definition.
 * @param {Record<string, any>} data
 * @param {Record<string, { type: string, required?: boolean, validator?: (v: any) => boolean, message?: string }>} schema
 * @returns {{ valid: boolean, errors: Array<{ field: string, message: string }> }}
 */
export function validate(data, schema) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ field: '_root', message: 'Data must be an object' }] };
  }

  for (const [key, rule] of Object.entries(schema)) {
    const val = data[key];
    if (rule.required && (val === undefined || val === null || val === '')) {
      errors.push({ field: key, message: rule.message || `Field ${key} is required` });
      continue;
    }
    if (val !== undefined && val !== null && val !== '') {
      if (rule.type === 'string' && typeof val !== 'string') {
        errors.push({ field: key, message: rule.message || `Field ${key} must be a string` });
      } else if (rule.type === 'number' && (typeof val !== 'number' || isNaN(val))) {
        errors.push({ field: key, message: rule.message || `Field ${key} must be a number` });
      } else if (rule.type === 'boolean' && typeof val !== 'boolean') {
        errors.push({ field: key, message: rule.message || `Field ${key} must be a boolean` });
      } else if (rule.type === 'array' && !Array.isArray(val)) {
        errors.push({ field: key, message: rule.message || `Field ${key} must be an array` });
      } else if (rule.validator && !rule.validator(val)) {
        errors.push({ field: key, message: rule.message || `Field ${key} failed validation` });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
