/**
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
