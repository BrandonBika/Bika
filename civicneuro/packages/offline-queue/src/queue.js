/**
 * @file packages/offline-queue/src/queue.js
 * IndexedDB-backed queue. Structured cloning preserves Blob/File values.
 */
import { generateIdempotencyKey } from './idempotency-key.js';

const DATABASE_NAME = 'civicneuro-offline-reports';
const STORE_NAME = 'reports';
let memoryQueue = [];
let databasePromise;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'idempotencyKey' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open the offline report queue.'));
      request.onblocked = () => reject(new Error('The offline report queue is blocked by another tab.'));
    });
  }
  return databasePromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline report queue operation failed.'));
  });
}

export async function enqueueReport(reportPayload, endpoint = null) {
  const idempotencyKey = reportPayload.idempotency_key || generateIdempotencyKey();
  const item = {
    idempotencyKey,
    endpoint,
    payload: { ...reportPayload, idempotency_key: idempotencyKey },
    queuedAt: new Date().toISOString(),
    retryCount: 0
  };
  const db = await openDatabase();
  if (!db) {
    memoryQueue.push(item);
    return item;
  }
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).add(item);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not persist the offline report.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline report persistence was aborted.'));
  });
  return item;
}

export async function getQueuedReports() {
  const db = await openDatabase();
  if (!db) return [...memoryQueue];
  return requestResult(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll());
}

export async function dequeueReport(idempotencyKey) {
  const db = await openDatabase();
  if (!db) {
    memoryQueue = memoryQueue.filter((item) => item.idempotencyKey !== idempotencyKey);
    return;
  }
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(idempotencyKey);
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not remove the submitted report from the queue.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline queue removal was aborted.'));
  });
}

export async function clearQueue() {
  const db = await openDatabase();
  if (!db) {
    memoryQueue = [];
    return;
  }
  const transaction = db.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).clear();
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not clear the offline report queue.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline queue clearing was aborted.'));
  });
}
