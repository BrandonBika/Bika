import assert from 'node:assert/strict';
import test from 'node:test';
import {
  block,
  cancelRequest,
  listCircle,
  listRequests,
  removeConnection,
  respondToRequest,
  searchResidents,
  sendRequest,
  setDiscoverable,
  unblock
} from '../src/features/beacon/beacon-circle.client.js';
import { setSession } from '../../../packages/supabase-client/src/auth.js';
import { configureSupabaseClient } from '../../../packages/supabase-client/src/client.js';

configureSupabaseClient({
  url: 'https://beacon-circle-test.supabase.co',
  anonKey: 'public-test-key'
});
setSession('resident-access-token', { id: 'resident-a' }, 'resident-refresh-token');

test('Beacon circle client calls secure RPCs and maps privacy-limited results', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    const pathname = new URL(url).pathname;
    const response = pathname.endsWith('/rpc/search_residents')
      ? [{ user_id: 'resident-b', display_name: 'Resident B' }]
      : pathname.endsWith('/rpc/list_circle')
        ? [{ user_id: 'resident-b', display_name: 'Resident B' }]
        : pathname.endsWith('/rpc/list_circle_requests')
          ? [{
              request_id: 'request-1',
              user_id: 'resident-b',
              display_name: 'Resident B',
              status: 'pending',
              direction: 'incoming',
              created_at: '2026-10-20T00:00:00Z',
              responded_at: null
            }]
          : null;
    return new Response(JSON.stringify(response), { status: 200 });
  };

  try {
    assert.deepEqual(await searchResidents('Resident'), [{
      id: 'resident-b',
      name: 'Resident B',
      initial: 'R'
    }]);
    assert.equal(await sendRequest('resident-b'), null);
    assert.equal(await respondToRequest('request-1', true), null);
    assert.equal(await cancelRequest('request-1'), null);
    assert.equal(await removeConnection('resident-b'), null);
    assert.equal(await block('resident-b'), null);
    assert.equal(await unblock('resident-b'), null);
    assert.deepEqual(await listCircle(), [{
      id: 'resident-b',
      name: 'Resident B',
      initial: 'R'
    }]);
    assert.deepEqual(await listRequests(), [{
      id: 'request-1',
      userId: 'resident-b',
      name: 'Resident B',
      initial: 'R',
      status: 'pending',
      direction: 'incoming',
      createdAt: '2026-10-20T00:00:00Z',
      respondedAt: null,
      meta: 'Wants to share with you'
    }]);
    assert.equal(await setDiscoverable(false), null);

    assert.equal(new URL(requests[0].url).pathname, '/rest/v1/rpc/search_residents');
    assert.deepEqual(JSON.parse(requests[0].options.body), { p_query: 'Resident' });
    assert.deepEqual(JSON.parse(requests[1].options.body), { p_target_id: 'resident-b' });
    assert.deepEqual(JSON.parse(requests[2].options.body), {
      p_request_id: 'request-1',
      p_accept: true
    });
    assert.deepEqual(JSON.parse(requests[6].options.body), { p_other_user_id: 'resident-b' });
    assert.equal(new URL(requests[7].url).pathname, '/rest/v1/rpc/list_circle');
    assert.equal(new URL(requests[8].url).pathname, '/rest/v1/rpc/list_circle_requests');
    assert.deepEqual(JSON.parse(requests[9].options.body), { p_discoverable: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Beacon circle client validates required resident inputs before requests', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response('null', { status: 200 });
  };
  try {
    await assert.rejects(searchResidents('  '), /resident name or full phone number/);
    await assert.rejects(sendRequest('resident-a'), /yourself/);
    await assert.rejects(respondToRequest('request-1', 'yes'), /must be accept or decline/);
    await assert.rejects(removeConnection('resident-a'), /remove yourself/);
    await assert.rejects(block('resident-a'), /block yourself/);
    await assert.rejects(unblock('resident-a'), /unblock yourself/);
    await assert.rejects(setDiscoverable('false'), /must be a boolean/);
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
