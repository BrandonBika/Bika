/**
 * @file packages/offline-queue/src/idempotency-key.js
 * Generates client-side unique idempotency keys.
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'cn-idem-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}
