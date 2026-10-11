/**
 * @file packages/security-web/src/csv-safe.js
 * @description Guards against CSV formula injection (spreadsheet injection).
 * Any cell value starting with =, +, -, or @ is prefixed with a tab so
 * spreadsheet applications do not interpret it as a formula.
 * Reference: OWASP CSV Injection
 */

const FORMULA_START_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Makes a single CSV cell value safe against formula injection.
 * @param {unknown} value
 * @returns {string}
 */
export function csvSafeCell(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.length === 0) return str;
  if (FORMULA_START_CHARS.has(str[0])) {
    return '\t' + str;
  }
  return str;
}

/**
 * Encodes a value for a CSV cell: wraps in quotes, escapes internal quotes.
 * @param {unknown} value
 * @returns {string}
 */
export function csvEncodeCell(value) {
  const safe = csvSafeCell(value);
  // If it contains comma, newline or double-quote, wrap in double-quotes
  if (safe.includes(',') || safe.includes('\n') || safe.includes('"')) {
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  return safe;
}

/**
 * Converts an array of row arrays into a safe CSV string.
 * @param {unknown[][]} rows
 * @param {string[]} [headers]
 * @returns {string}
 */
export function toCsv(rows, headers) {
  const lines = [];
  if (headers && headers.length) {
    lines.push(headers.map(csvEncodeCell).join(','));
  }
  for (const row of rows) {
    lines.push(row.map(csvEncodeCell).join(','));
  }
  return lines.join('\r\n');
}
