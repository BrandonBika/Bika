/**
 * @file packages/offline-queue/src/sync.js
 * Offline queue sync manager.
 */
import { getQueuedReports, dequeueReport } from './queue.js';
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';

export async function syncOfflineQueue({ submitSnapAndSay } = {}) {
  const items = await getQueuedReports();
  const results = [];
  for (const item of items) {
    try {
      if (item.payload?.type === 'snap-and-say') {
        if (!submitSnapAndSay) {
          results.push({ item, success: false, skipped: true });
          continue;
        }
        const result = await submitSnapAndSay(item.payload);
        results.push({ item, success: true, result });
        await dequeueReport(item.idempotencyKey);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('offline-report-synced', {
            detail: { idempotencyKey: item.idempotencyKey, result }
          }));
        }
        continue;
      } else {
        await invokeFunction(item.endpoint || Endpoints.REPORT_SUBMIT, {
          ...item.payload,
          idempotency_key: item.idempotencyKey
        });
      }
      await dequeueReport(item.idempotencyKey);
      results.push({ item, success: true });
    } catch (err) {
      const permanentSnapFailure = item.payload?.type === 'snap-and-say' && err.status >= 400 && err.status < 500;
      if (permanentSnapFailure) await dequeueReport(item.idempotencyKey);
      results.push({ item, success: false, permanentFailure: permanentSnapFailure, error: err });
      if (permanentSnapFailure && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('offline-report-failed', {
          detail: { idempotencyKey: item.idempotencyKey, message: err.message }
        }));
      }
    }
  }
  return results;
}
