/**
 * @file packages/schemas/src/lifeline.js
 * Schemas for Lifeline emergency cards and contacts.
 */
import { validate } from './validate.js';
import { isValidPhone } from './common.js';

export const lifelineCardSchema = {
  name: { type: 'string', required: true },
  phone: { type: 'string', required: true, validator: isValidPhone, message: 'Valid emergency phone number required' },
  icon: { type: 'string', required: false },
  color: { type: 'string', required: false },
  isPreset: { type: 'boolean', required: false }
};

export function validateLifelineCard(data) {
  return validate(data, lifelineCardSchema);
}
