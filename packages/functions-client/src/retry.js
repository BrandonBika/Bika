/**
 * @file packages/functions-client/src/retry.js
 * Exponential backoff retry helper.
 */
export async function withRetry(fn, { maxRetries = 3, initialDelayMs = 300 } = {}) {
  let attempt = 0;
  let delay = initialDelayMs;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries || (err.status && err.status >= 400 && err.status < 500 && err.status !== 429)) {
        throw err;
      }
      await new Promise((res) => setTimeout(res, delay));
      delay *= 2;
    }
  }
}
