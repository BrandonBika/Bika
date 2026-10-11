/**
 * @file packages/security-web/test/security-web.test.js
 * Unit tests for security-web helpers using node:test.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// We test the pure JS functions only (no DOM)
import { escapeHtml } from '../src/escape-html.js';
import { sanitizeUrl, sanitizeStorageUrl } from '../src/sanitize-url.js';
import { csvSafeCell, csvEncodeCell, toCsv } from '../src/csv-safe.js';
import { redactString, redactDeep } from '../src/redact.js';

// ── escapeHtml ────────────────────────────────────────────────────────────
describe('escapeHtml', () => {
  it('escapes & < > " and single quote', () => {
    assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#x27;');
  });
  it('returns empty string for null/undefined', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });
  it('coerces numbers', () => {
    assert.equal(escapeHtml(42), '42');
  });
  it('does not double-escape', () => {
    assert.equal(escapeHtml('<b>'), '&lt;b&gt;');
  });
  it('leaves safe strings unchanged', () => {
    assert.equal(escapeHtml('Hello world'), 'Hello world');
  });
});

// ── sanitizeUrl ───────────────────────────────────────────────────────────
describe('sanitizeUrl', () => {
  it('allows https URLs', () => {
    assert.equal(sanitizeUrl('https://example.com'), 'https://example.com');
  });
  it('allows http URLs', () => {
    assert.equal(sanitizeUrl('http://localhost:3000'), 'http://localhost:3000');
  });
  it('blocks javascript: scheme', () => {
    assert.equal(sanitizeUrl('javascript:alert(1)'), '#');
  });
  it('blocks data: scheme', () => {
    assert.equal(sanitizeUrl('data:text/html,<h1>XSS</h1>'), '#');
  });
  it('allows relative paths starting with /', () => {
    assert.equal(sanitizeUrl('/page'), '/page');
  });
  it('allows hash anchors', () => {
    assert.equal(sanitizeUrl('#section'), '#section');
  });
  it('returns # for null', () => {
    assert.equal(sanitizeUrl(null), '#');
  });
  it('returns # for empty string', () => {
    assert.equal(sanitizeUrl(''), '#');
  });
});

// ── csvSafeCell ───────────────────────────────────────────────────────────
describe('csvSafeCell', () => {
  it('prefixes = with tab', () => {
    assert.equal(csvSafeCell('=SUM(A1)'), '\t=SUM(A1)');
  });
  it('prefixes + with tab', () => {
    assert.equal(csvSafeCell('+cmd'), '\t+cmd');
  });
  it('prefixes - with tab', () => {
    assert.equal(csvSafeCell('-2+3'), '\t-2+3');
  });
  it('prefixes @ with tab', () => {
    assert.equal(csvSafeCell('@SUM'), '\t@SUM');
  });
  it('leaves safe strings unchanged', () => {
    assert.equal(csvSafeCell('Safe text'), 'Safe text');
  });
  it('handles null', () => {
    assert.equal(csvSafeCell(null), '');
  });
});

describe('toCsv', () => {
  it('builds a CSV with headers', () => {
    const csv = toCsv([['Alice', '=HACK']], ['Name', 'Note']);
    assert.ok(csv.startsWith('Name,Note'));
    assert.ok(csv.includes('\t=HACK'));
  });
});

// ── redactString ──────────────────────────────────────────────────────────
describe('redactString', () => {
  it('redacts SA phone numbers', () => {
    const out = redactString('Call +27821234567 now');
    assert.ok(!out.includes('27821234567'), 'phone not redacted');
    assert.ok(out.includes('[REDACTED:phone]'));
  });
  it('redacts email addresses', () => {
    const out = redactString('Email me at user@example.com please');
    assert.ok(!out.includes('user@example.com'));
    assert.ok(out.includes('[REDACTED:email]'));
  });
  it('redacts GPS coordinates', () => {
    const out = redactString('Location: -33.9249, 18.4241');
    assert.ok(!out.includes('-33.9249'));
    assert.ok(out.includes('[REDACTED:coords]'));
  });
  it('redacts JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = redactString(`token=${jwt}`);
    assert.ok(!out.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
  });
  it('leaves safe strings unchanged', () => {
    assert.equal(redactString('No PII here'), 'No PII here');
  });
});

describe('redactDeep', () => {
  it('redacts password fields by key name', () => {
    const out = redactDeep({ password: 'secret123', name: 'Alice' });
    assert.equal(out.password, '[REDACTED:field]');
    assert.equal(out.name, 'Alice');
  });
  it('recursively redacts nested objects', () => {
    const out = redactDeep({ user: { email: 'a@b.com' } });
    assert.ok(out.user.email.includes('[REDACTED:email]'));
  });
  it('redacts token keys', () => {
    const out = redactDeep({ accessToken: 'abc123' });
    assert.equal(out.accessToken, '[REDACTED:field]');
  });
});
