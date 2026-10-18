import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getClassificationPollState,
  pollSnapAndSayClassification,
  SNAP_AND_SAY_POLL_TIMEOUT_MS
} from '../src/features/snap-and-say/classification-poll.js';

test('polling window covers the configured Gemini retry and fallback budget', () => {
  assert.equal(SNAP_AND_SAY_POLL_TIMEOUT_MS, 120000);
});

test('identifies a pending report as processing rather than awaiting review', () => {
  assert.equal(getClassificationPollState({
    status: 'Needs Review',
    ai_category: 'Unclear report',
    review_reason: 'Analysis pending.'
  }), 'processing');
});

test('polls while processing, then returns a completed classification', async () => {
  const reports = [
    { status: 'Needs Review', ai_category: 'Unclear report', review_reason: 'Analysis pending.' },
    { status: 'Pending Dispatch', ai_category: 'fire', review_reason: '' }
  ];
  let now = 0;
  const result = await pollSnapAndSayClassification(async () => reports.shift(), {
    timeoutMs: 100,
    pollIntervalMs: 10,
    now: () => now,
    sleep: async (delay) => { now += delay; }
  });
  assert.equal(result.state, 'completed');
  assert.equal(result.report.ai_category, 'fire');
});

test('returns failed when the server records an analysis failure', async () => {
  const result = await pollSnapAndSayClassification(async () => ({
    status: 'Needs Review',
    ai_category: 'Unclear report',
    review_reason: 'Analysis failed: timeout: Gemini request timed out.'
  }));
  assert.equal(result.state, 'failed');
});

test('returns completed for a classified report awaiting human review', async () => {
  const result = await pollSnapAndSayClassification(async () => ({
    status: 'Needs Review',
    ai_category: 'Unclear report',
    review_reason: 'The issue type could not be determined; a person must review it.'
  }));
  assert.equal(result.state, 'completed');
});

test('times out while the report is still pending classification', async () => {
  let now = 0;
  const result = await pollSnapAndSayClassification(async () => ({
    status: 'Needs Review',
    ai_category: 'Unclear report',
    review_reason: 'Analysis pending.'
  }), {
    timeoutMs: 20,
    pollIntervalMs: 10,
    now: () => now,
    sleep: async (delay) => { now += delay; }
  });
  assert.equal(result.state, 'timed-out');
});

test('times out if a status request never completes', async () => {
  const result = await pollSnapAndSayClassification(() => new Promise(() => {}), {
    timeoutMs: 5
  });
  assert.equal(result.state, 'timed-out');
});
