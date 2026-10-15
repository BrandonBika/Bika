/**
 * @file tools/populate-schemas.js
 * Script to write all schema files in packages/schemas/src/
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

write('packages/schemas/src/validate.js', `/**
 * @file packages/schemas/src/validate.js
 * @description Lightweight validator for runtime shapes.
 */

export class ValidationError extends Error {
  /**
   * @param {string} field
   * @param {string} message
   */
  constructor(field, message) {
    super(\`Validation error on \${field}: \${message}\`);
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
      errors.push({ field: key, message: rule.message || \`Field \${key} is required\` });
      continue;
    }
    if (val !== undefined && val !== null && val !== '') {
      if (rule.type === 'string' && typeof val !== 'string') {
        errors.push({ field: key, message: rule.message || \`Field \${key} must be a string\` });
      } else if (rule.type === 'number' && (typeof val !== 'number' || isNaN(val))) {
        errors.push({ field: key, message: rule.message || \`Field \${key} must be a number\` });
      } else if (rule.type === 'boolean' && typeof val !== 'boolean') {
        errors.push({ field: key, message: rule.message || \`Field \${key} must be a boolean\` });
      } else if (rule.type === 'array' && !Array.isArray(val)) {
        errors.push({ field: key, message: rule.message || \`Field \${key} must be an array\` });
      } else if (rule.validator && !rule.validator(val)) {
        errors.push({ field: key, message: rule.message || \`Field \${key} failed validation\` });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
`);

write('packages/schemas/src/common.js', `/**
 * @file packages/schemas/src/common.js
 * Common schema validators.
 */
export const phoneRegex = /^(?:\\+27|0)[6-8][0-9]{8}$/;
export const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
export const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidPhone = (v) => typeof v === 'string' && phoneRegex.test(v.replace(/\\s+/g, ''));
export const isValidEmail = (v) => typeof v === 'string' && emailRegex.test(v.trim());
export const isValidUuid = (v) => typeof v === 'string' && uuidRegex.test(v);
`);

write('packages/schemas/src/auth.js', `/**
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
`);

write('packages/schemas/src/reports.js', `/**
 * @file packages/schemas/src/reports.js
 * Schemas for report creation, AI drafts, guest reports, tracking.
 */
import { validate } from './validate.js';

export const reportCreateSchema = {
  title: { type: 'string', required: true },
  description: { type: 'string', required: true },
  category: { type: 'string', required: true },
  latitude: { type: 'number', required: true, validator: (v) => v >= -35 && v <= -22, message: 'Coordinates must be within South Africa' },
  longitude: { type: 'number', required: true, validator: (v) => v >= 16 && v <= 33, message: 'Coordinates must be within South Africa' },
  address: { type: 'string', required: false },
  mediaIds: { type: 'array', required: false },
  isAnonymous: { type: 'boolean', required: false }
};

export function validateReportCreate(data) {
  return validate(data, reportCreateSchema);
}

export const snapAndSayDraftSchema = {
  category: { type: 'string', required: true },
  description: { type: 'string', required: true },
  keywords: { type: 'array', required: false },
  urgency: { type: 'string', required: false },
  followUpQuestion: { type: 'string', required: false },
  isEmergency: { type: 'boolean', required: false }
};

export function validateSnapAndSayDraft(data) {
  return validate(data, snapAndSayDraftSchema);
}
`);

write('packages/schemas/src/beacon.js', `/**
 * @file packages/schemas/src/beacon.js
 * Schemas for Beacon circle members, requests, sharing sessions.
 */
import { validate } from './validate.js';

export const beaconShareSchema = {
  recipientId: { type: 'string', required: true },
  durationMinutes: { type: 'number', required: true, validator: (v) => v > 0 && v <= 720 },
  reason: { type: 'string', required: false }
};

export function validateBeaconShare(data) {
  return validate(data, beaconShareSchema);
}
`);

write('packages/schemas/src/lifeline.js', `/**
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
`);

write('packages/schemas/src/surveys.js', `/**
 * @file packages/schemas/src/surveys.js
 */
import { validate } from './validate.js';

export const surveyResponseSchema = {
  surveyId: { type: 'string', required: true },
  answers: { type: 'array', required: true }
};

export function validateSurveyResponse(data) {
  return validate(data, surveyResponseSchema);
}
`);

write('packages/schemas/src/posts.js', `/**
 * @file packages/schemas/src/posts.js
 */
import { validate } from './validate.js';

export const postVoteSchema = {
  pollId: { type: 'string', required: true },
  optionId: { type: 'string', required: true }
};

export function validatePostVote(data) {
  return validate(data, postVoteSchema);
}
`);

write('packages/schemas/src/media.js', `/**
 * @file packages/schemas/src/media.js
 */
export const maxFileSize = 15 * 1024 * 1024; // 15MB
export const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'video/mp4'];
`);

write('packages/schemas/src/chat.js', `/**
 * @file packages/schemas/src/chat.js
 */
import { validate } from './validate.js';

export const chatMessageSchema = {
  sessionId: { type: 'string', required: true },
  text: { type: 'string', required: true, validator: (v) => typeof v === 'string' && v.trim().length > 0 }
};

export function validateChatMessage(data) {
  return validate(data, chatMessageSchema);
}
`);

write('packages/schemas/src/organisations.js', `/**
 * @file packages/schemas/src/organisations.js
 */
export const orgTypes = ['municipality', 'saps', 'ems', 'metro_police', 'ward_committee', 'ngo'];
`);

write('packages/schemas/src/exports.js', `/**
 * @file packages/schemas/src/exports.js
 */
export const exportFormats = ['json', 'csv'];
`);

write('packages/schemas/src/index.js', `/**
 * @file packages/schemas/src/index.js
 */
export * from './validate.js';
export * from './common.js';
export * from './auth.js';
export * from './reports.js';
export * from './beacon.js';
export * from './lifeline.js';
export * from './surveys.js';
export * from './posts.js';
export * from './media.js';
export * from './chat.js';
export * from './organisations.js';
export * from './exports.js';
`);

write('packages/schemas/test/schemas.test.js', `/**
 * @file packages/schemas/test/schemas.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegister, validateReportCreate, validateLifelineCard, isValidPhone, isValidEmail } from '../src/index.js';

describe('Schemas Validation', () => {
  it('validates SA phone numbers', () => {
    assert.strictEqual(isValidPhone('0821234567'), true);
    assert.strictEqual(isValidPhone('+27821234567'), true);
    assert.strictEqual(isValidPhone('12345'), false);
  });

  it('validates email addresses', () => {
    assert.strictEqual(isValidEmail('resident@civicneuro.co.za'), true);
    assert.strictEqual(isValidEmail('invalid'), false);
  });

  it('validates report creation payload', () => {
    const validReport = {
      title: 'Water leak',
      description: 'Burst water pipe on corner of 4th Ave',
      category: 'water_sanitation',
      latitude: -29.8587,
      longitude: 31.0218
    };
    const res = validateReportCreate(validReport);
    assert.strictEqual(res.valid, true);
  });
});
`);

console.log('Schemas generated successfully.');
