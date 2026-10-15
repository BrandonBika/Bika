/**
 * @file packages/security-web/src/sanitize-url.js
 * @description Safe URL validation. Only allows http: and https: schemes.
 * Use this before setting href, src, or action attributes.
 */

/** Safe schemes for user-supplied URLs */
const SAFE_SCHEMES = new Set(['https:', 'http:']);

/** Schemes that are always safe for app-internal navigation */
const INTERNAL_SCHEMES = new Set(['#', '/', './']);

/**
 * Validates a URL string and returns it only if the scheme is safe.
 * Returns '#' (a no-op anchor) if the URL is dangerous or malformed.
 *
 * @param {unknown} url
 * @returns {string}
 */
export function sanitizeUrl(url) {
  if (url === null || url === undefined) return '#';
  const str = String(url).trim();
  if (!str) return '#';

  // Allow relative URLs starting with / ./ or #
  for (const prefix of INTERNAL_SCHEMES) {
    if (str.startsWith(prefix)) return str;
  }

  try {
    const parsed = new URL(str);
    if (SAFE_SCHEMES.has(parsed.protocol)) return str;
  } catch {
    // malformed — fall through
  }
  return '#';
}

/**
 * Validates that a URL points to the Supabase Storage origin.
 * Use for signed media URLs before setting img src.
 * @param {string} url
 * @param {string} storageOrigin - e.g. "https://abc.supabase.co"
 * @returns {string}
 */
export function sanitizeStorageUrl(url, storageOrigin) {
  const safe = sanitizeUrl(url);
  if (safe === '#') return safe;
  try {
    const parsed = new URL(safe);
    const allowed = new URL(storageOrigin);
    if (parsed.origin === allowed.origin) return safe;
  } catch {
    // fall through
  }
  return '#';
}
