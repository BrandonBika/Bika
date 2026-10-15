/**
 * @file packages/security-web/src/escape-html.js
 * @description HTML-escapes a string so it can be placed in text content
 * without risk of XSS. Replaces all five critical HTML characters.
 *
 * Usage:
 *   import { escapeHtml } from './escape-html.js';
 *   element.textContent = ''; // clear first
 *   element.setAttribute('data-label', escapeHtml(userValue));
 */

/** @type {Record<string,string>} */
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const HTML_ESCAPE_RE = /[&<>"']/g;

/**
 * Escapes HTML special characters in a string.
 * @param {unknown} value - Any value; non-strings are coerced.
 * @returns {string} HTML-safe string.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPES[c]);
}
