import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const workerPath = path.resolve(import.meta.dirname, '../service-worker.js');
const workerSource = fs.readFileSync(workerPath, 'utf8');

function createWorker({ cachedResponse = null, networkFetch }) {
  const listeners = new Map();
  const context = {
    URL,
    Promise,
    self: {
      addEventListener(type, listener) {
        listeners.set(type, listener);
      }
    },
    caches: {
      match: async (request) => request === './offline.html'
        ? { type: 'offline' }
        : cachedResponse
    },
    fetch: networkFetch
  };
  vm.runInNewContext(workerSource, context, { filename: workerPath });
  return listeners.get('fetch');
}

async function requestWorker(eventHandler, request) {
  let responsePromise;
  eventHandler({
    request: {
      method: 'GET',
      url: 'https://example.test/resident-pwa/src/main.css',
      ...request
    },
    respondWith(promise) {
      responsePromise = promise;
    }
  });
  return responsePromise;
}

test('service worker serves offline.html only for failed navigation requests', async () => {
  const fetchHandler = createWorker({
    networkFetch: async () => { throw new Error('offline'); }
  });

  const navigationResponse = await requestWorker(fetchHandler, { mode: 'navigate' });
  assert.deepEqual(navigationResponse, { type: 'offline' });
});

test('service worker propagates failed non-navigation asset requests', async () => {
  const networkError = new Error('stylesheet request failed');
  const fetchHandler = createWorker({
    networkFetch: async () => { throw networkError; }
  });

  await assert.rejects(
    requestWorker(fetchHandler, { mode: 'cors' }),
    (error) => error.message === networkError.message
  );
});

test('service worker uses the v14 shell cache', () => {
  assert.match(workerSource, /const CACHE_NAME = 'cn-shell-v14';/);
});
