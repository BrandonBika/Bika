/**
 * @file packages/schemas/src/auth.js
 * Schemas for authentication, registration, password reset.
 */
import { validate } from './validate.js';
import { isValidPhone, isValidEmail } from './common.js';

export const registerSchema = {
  fullName: { type: 'string', required: true },
  phone: { type: 'string', required: true, validator: isValidPhone, message: 'Valid South African phone number required' },
  email: { type: 'string', required: false, validator: (v) => !v || isValidEmail(v), message: 'Valid email required' },
  password: { type: 'string', required: true, validator: (v) => typeof v === 'string' && v.length >= 8, message: 'Password must be at least 8 characters' },
  consentTimestamp: { type: 'string', required: true, message: 'POPIA consent is required' }
};

export function validateRegister(data) {
  return validate(data, registerSchema);
}

export const signInSchema = {
  identifier: { type: 'string', required: true, message: 'Phone or email is required' },
  password: { type: 'string', required: true, message: 'Password is required' }
};

export function validateSignIn(data) {
  return validate(data, signInSchema);
}
