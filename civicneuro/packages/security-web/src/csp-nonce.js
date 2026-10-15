/**
 * @file packages/security-web/src/csp-nonce.js
 * @description CSP nonce helper.
 * The nonce is injected by the server/edge into the <meta> tag.
 * This module reads it once and exposes it for dynamic script elements
 * (should be rare — prefer static scripts).
 */

/** @type {string|null} */
let _nonce = null;

/**
 * Reads the CSP nonce from <meta name="csp-nonce" content="...">
 * Returns empty string if not present (non-nonce CSP mode).
 * @returns {string}
 */
export function getNonce() {
  if (_nonce !== null) return _nonce;
  if (typeof document === 'undefined') return (_nonce = '');
  const meta = document.querySelector('meta[name="csp-nonce"]');
  _nonce = meta ? (meta.getAttribute('content') ?? '') : '';
  return _nonce;
}

/**
 * Applies the CSP nonce to a script element.
 * @param {HTMLScriptElement} el
 */
export function applyNonce(el) {
  const n = getNonce();
  if (n) el.nonce = n;
}
