export class RequestTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`${operation} timed out after ${timeoutMs / 1000} seconds.`);
    this.name = 'RequestTimeoutError';
  }
}

export function withTimeout(operation, label, timeoutMs = 10_000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new RequestTimeoutError(label, timeoutMs)), timeoutMs);
  });
  return Promise.race([Promise.resolve(operation), timeout]).finally(() => globalThis.clearTimeout(timer));
}
