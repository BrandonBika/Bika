import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestTimeoutError, withTimeout } from '../src/features/with-timeout.js';

test('withTimeout resolves completed operations', async () => {
  assert.equal(await withTimeout(Promise.resolve('ok'), 'Test operation', 50), 'ok');
});

test('withTimeout rejects stalled operations with a descriptive timeout error', async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 'Test operation', 5),
    (error) => error instanceof RequestTimeoutError && /Test operation timed out/.test(error.message)
  );
});
