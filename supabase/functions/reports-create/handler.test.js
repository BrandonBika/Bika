import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReportsCreate } from './handler.js';

test('reports-create reuses report-submit validation and rejects unauthenticated callers', async () => {
  const response = await handleReportsCreate(new Request(
    'https://project.example.test/functions/v1/reports-create',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'roads_traffic' })
    }
  ), {
    env: { get: () => '' },
    fetchImpl: async () => {
      throw new Error('Authentication must not be called without a bearer token');
    }
  });

  assert.equal(response.status, 401);
});