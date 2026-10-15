/**
 * @file packages/config/src/regex.js
 * @description Shared validation regular expressions.
 */

/** SA phone number: +27 or 0XX format */
export const SA_PHONE = /^(\+27|0)[0-9][0-9\s\-]{7,10}[0-9]$/;

/** Email (RFC 5322 simplified) */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reference number format CN-YYYY-XXXXX */
export const REFERENCE_NUMBER = /^CN-\d{4}-[A-Z0-9]{5,12}$/i;

/** Disallowed URL schemes */
export const UNSAFE_SCHEME = /^(javascript|data|vbscript|file):/i;

/**
 * Validates a South African phone number.
 * @param {string} v
 * @returns {boolean}
 */
export function isValidSAPhone(v) {
  return SA_PHONE.test(v.trim());
}

/**
 * Validates an email address.
 * @param {string} v
 * @returns {boolean}
 */
export function isValidEmail(v) {
  return EMAIL.test(v.trim());
}
