/**
 * @file packages/functions-client/src/errors.js
 * Standard error shape for Edge Function invocations.
 */
export class FunctionError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} status
   * @param {any} [details]
   */
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.name = 'FunctionError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
