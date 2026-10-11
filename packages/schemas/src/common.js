/**
 * @file packages/schemas/src/common.js
 * Common schema validators.
 */
export const phoneRegex = /^(?:\+27|0)[6-8][0-9]{8}$/;
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidPhone = (v) => typeof v === 'string' && phoneRegex.test(v.replace(/\s+/g, ''));
export const isValidEmail = (v) => typeof v === 'string' && emailRegex.test(v.trim());
export const isValidUuid = (v) => typeof v === 'string' && uuidRegex.test(v);
