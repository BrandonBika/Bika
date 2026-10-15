/**
 * @file packages/security-web/src/redact.js
 * @description Redacts PII from strings before logging.
 * Patterns: phone numbers, emails, coordinates, tokens (JWT/Bearer).
 */

/** @type {Array<{name: string, re: RegExp, replacement: string}>} */
const REDACT_RULES = [
  // JWT / Bearer tokens
  {
    name: 'jwt',
    re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: '[REDACTED:token]',
  },
  // Bearer / Authorization header values
  {
    name: 'bearer',
    re: /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
    replacement: 'Bearer [REDACTED]',
  },
  // SA phone numbers (+27 or 0XX formats)
  {
    name: 'phone',
    re: /(\+27|0)[0-9][0-9\s\-]{7,11}[0-9]/g,
    replacement: '[REDACTED:phone]',
  },
  // Email addresses
  {
    name: 'email',
    re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    replacement: '[REDACTED:email]',
  },
  // GPS coordinates (lat,lng or lat: lng:)
  {
    name: 'coords',
    re: /-?\d{1,3}\.\d{4,}[,\s]+-?\d{1,3}\.\d{4,}/g,
    replacement: '[REDACTED:coords]',
  },
  // Supabase service role key pattern (sbsec_...)
  {
    name: 'service-role',
    re: /sbsec_[A-Za-z0-9_-]{20,}/g,
    replacement: '[REDACTED:service-role]',
  },
];

/**
 * Redacts known PII patterns from a string.
 * @param {string} str
 * @returns {string}
 */
export function redactString(str) {
  let result = str;
  for (const rule of REDACT_RULES) {
    result = result.replace(rule.re, rule.replacement);
  }
  return result;
}

/**
 * Recursively redacts PII from an object (for structured log payloads).
 * Returns a new object — does not mutate the original.
 * @param {unknown} value
 * @param {number} [depth=0]
 * @returns {unknown}
 */
export function redactDeep(value, depth = 0) {
  if (depth > 8) return '[DEPTH_LIMIT]';
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v, depth + 1));
  }
  /** @type {Record<string,unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    // Suppress entire fields that are always sensitive
    if (/password|token|secret|key|credential|ssn|nric/i.test(k)) {
      out[k] = '[REDACTED:field]';
    } else {
      out[k] = redactDeep(v, depth + 1);
    }
  }
  return out;
}
