/**
 * @file tests/security/resident-security.test.js
 * Security test suite for Resident PWA requirements.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../../packages/security-web/src/escape-html.js';
import { csvSafeCell } from '../../packages/security-web/src/csv-safe.js';
import { redactString } from '../../packages/security-web/src/redact.js';
import { validateReportCreate } from '../../packages/schemas/src/reports.js';

describe('Resident PWA Security Compliance', () => {
  it('Stored XSS protection: properly escapes script tags and attributes', () => {
    const malicious = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    const clean = escapeHtml(malicious);
    assert.strictEqual(clean.includes('<script>'), false);
    assert.strictEqual(clean.includes('onerror'), true); // Escaped as text
    assert.strictEqual(clean.includes('&lt;script&gt;'), true);
  });

  it('CSV Formula Injection protection: escapes leading formulas in data export', () => {
    assert.strictEqual(csvSafeCell('=SUM(A1:A10)'), '\t=SUM(A1:A10)');
    assert.strictEqual(csvSafeCell('+cmd|"/C calc"!A0'), '\t+cmd|"/C calc"!A0');
    assert.strictEqual(csvSafeCell('-2+3*4'), '\t-2+3*4');
    assert.strictEqual(csvSafeCell('@SUM(1+1)'), '\t@SUM(1+1)');
  });

  it('Log Redaction: redacts phone numbers, emails, coordinates, and bearer tokens', () => {
    const raw = 'Resident 0821234567 reported leak at -29.8587, 31.0218, email test@civic.za, token Bearer eyJh123.456.789';
    const redacted = redactString(raw);
    assert.strictEqual(redacted.includes('0821234567'), false);
    assert.strictEqual(redacted.includes('test@civic.za'), false);
    assert.strictEqual(redacted.includes('31.0218'), false);
    assert.strictEqual(redacted.includes('eyJh123.456.789'), false);
  });

  it('Report schema prevents invalid coordinates outside South Africa', () => {
    const invalidLondon = {
      title: 'Pothole',
      description: 'London street',
      category: 'roads',
      latitude: 51.5074,
      longitude: -0.1278
    };
    const res = validateReportCreate(invalidLondon);
    assert.strictEqual(res.valid, false);
  });
});
