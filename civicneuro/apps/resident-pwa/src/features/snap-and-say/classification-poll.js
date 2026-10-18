export const SNAP_AND_SAY_POLL_TIMEOUT_MS = 120000;

export function getClassificationPollState(report) {
  if (!report) return 'processing';
  const reviewReason = String(report.review_reason || '');
  if (/^Analysis failed:/i.test(reviewReason)) return 'failed';
  if (reviewReason === 'Analysis pending.') return 'processing';
  if (
    (report.ai_category && report.ai_category !== 'Unclear report')
    || reviewReason
  ) return 'completed';
  return 'processing';
}

export async function pollSnapAndSayClassification(fetchReport, {
  timeoutMs = SNAP_AND_SAY_POLL_TIMEOUT_MS,
  pollIntervalMs = 1500,
  now = Date.now,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))
} = {}) {
  const deadline = now() + timeoutMs;
  let report = null;
  while (true) {
    const remainingBeforeFetch = deadline - now();
    if (remainingBeforeFetch <= 0) return { state: 'timed-out', report };
    let timeoutId;
    const requestTimeout = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(null), remainingBeforeFetch);
    });
    let fetched;
    try {
      fetched = await Promise.race([fetchReport(), requestTimeout]);
    } finally {
      clearTimeout(timeoutId);
    }
    if (fetched === null) return { state: 'timed-out', report };
    report = fetched;
    const state = getClassificationPollState(report);
    if (state !== 'processing') return { state, report };
    const remaining = deadline - now();
    if (remaining <= 0) return { state: 'timed-out', report };
    await sleep(Math.min(pollIntervalMs, remaining));
  }
}
