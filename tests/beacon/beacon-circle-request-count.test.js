import assert from 'node:assert/strict';
import test from 'node:test';
import { countIncomingPendingRequests } from '../../apps/resident-pwa/src/features/beacon/beacon-circle.client.js';

test('counts only incoming pending Beacon circle requests', () => {
  assert.equal(countIncomingPendingRequests([
    { direction: 'incoming', status: 'pending' },
    { direction: 'outgoing', status: 'pending' },
    { direction: 'incoming', status: 'accepted' },
    { direction: 'outgoing', status: 'accepted' }
  ]), 1);
});

test('requires an array when deriving incoming Beacon request count', () => {
  assert.throws(() => countIncomingPendingRequests(null), /must be an array/);
});
