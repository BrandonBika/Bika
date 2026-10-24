import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configureSupabaseClient
} from '../../../packages/supabase-client/src/client.js';
import { clearSession } from '../../../packages/supabase-client/src/auth.js';
import {
  endSession,
  startGuestSession,
  startResidentSession
} from '../src/session.js';

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};
const {
  getBeaconState,
  refreshBeaconCircle,
  refreshChatMessages,
  subscribeToBeaconChat
} = await import('../src/features/beacon/beacon.client.js');

configureSupabaseClient({
  url: 'https://beacon-wiring-test.supabase.co',
  anonKey: 'public-test-key'
});

function response(body, status = 200) {
  return new Response(body === null ? '' : JSON.stringify(body), { status });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail('Timed out waiting for the expected Supabase request.');
}

function signIn(userId = `beacon-test-${Date.now()}`) {
  startResidentSession('test-access-token', { id: userId }, 'test-refresh-token');
  return userId;
}

test('overlapping circle refreshes finish with the latest server data', async () => {
  const originalFetch = globalThis.fetch;
  signIn();
  const pending = [];
  globalThis.fetch = (url) => {
    const endpoint = new URL(url).pathname.endsWith('/rpc/list_circle')
      ? 'circle'
      : 'requests';
    const gate = deferred();
    pending.push({ endpoint, gate });
    return gate.promise;
  };

  try {
    const olderRefresh = refreshBeaconCircle();
    await waitFor(() => pending.length === 2);
    const concurrentRefresh = refreshBeaconCircle();
    for (const request of pending.slice(0, 2)) {
      request.gate.resolve(response(request.endpoint === 'circle'
        ? [{ user_id: 'old-resident', display_name: 'Older Result' }]
        : []));
    }
    await waitFor(() => pending.length === 4);
    for (const request of pending.slice(2, 4)) {
      request.gate.resolve(response(request.endpoint === 'circle'
        ? [{ user_id: 'new-resident', display_name: 'Latest Result' }]
        : []));
    }
    await Promise.all([olderRefresh, concurrentRefresh]);
    assert.deepEqual(getBeaconState().members.map(({ id, name }) => ({ id, name })), [{
      id: 'new-resident',
      name: 'Latest Result'
    }]);
    assert.equal(getBeaconState().pendingRequests.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    endSession();
  }
});

test('stale chat refresh cannot overwrite a newer refresh result', async () => {
  const originalFetch = globalThis.fetch;
  const userId = signIn();
  const messageReads = [];
  globalThis.fetch = (url, options = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith('/rpc/create_direct_conversation')) {
      return Promise.resolve(response('conversation-stale-test'));
    }
    if (pathname.endsWith('/rpc/mark_conversation_read')) {
      return Promise.resolve(response(null));
    }
    if (pathname.endsWith('/messages')) {
      const gate = deferred();
      messageReads.push(gate);
      return gate.promise;
    }
    assert.fail(`Unexpected Supabase request: ${options.method || 'GET'} ${pathname}`);
  };

  try {
    const olderRefresh = refreshChatMessages('peer-stale-test');
    await waitFor(() => messageReads.length === 1);
    const newerRefresh = refreshChatMessages('peer-stale-test');
    await waitFor(() => messageReads.length === 2);
    messageReads[1].resolve(response([{
      id: 'newer-message',
      sender_id: userId,
      type: 'text',
      body: 'Latest message',
      created_at: '2026-10-20T04:00:02.000Z'
    }]));
    await newerRefresh;
    messageReads[0].resolve(response([{
      id: 'older-message',
      sender_id: userId,
      type: 'text',
      body: 'Stale message',
      created_at: '2026-10-20T04:00:01.000Z'
    }]));
    await olderRefresh;
    assert.deepEqual(getBeaconState().chats['peer-stale-test'].map(({ id }) => [id]), [
      ['newer-message']
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    endSession();
  }
});

test('guest and unauthenticated circle refreshes fall back to local state', async () => {
  const originalFetch = globalThis.fetch;
  const members = getBeaconState().members;
  const requests = getBeaconState().pendingRequests;
  const testMember = { id: 'local-fallback-test', name: 'Local resident' };
  const testRequest = { id: 'local-fallback-request', userId: 'local-resident' };
  members.push(testMember);
  requests.push(testRequest);
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    return response([]);
  };

  try {
    startGuestSession('guest-token', { id: 'guest-fallback-user' });
    const guestResult = await refreshBeaconCircle();
    assert.equal(guestResult.members.some(({ id }) => id === testMember.id), true);

    endSession();
    const anonymousResult = await refreshBeaconCircle();
    assert.equal(anonymousResult.requests.some(({ id }) => id === testRequest.id), true);
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    endSession();
    const memberIndex = members.indexOf(testMember);
    if (memberIndex >= 0) members.splice(memberIndex, 1);
    const requestIndex = requests.indexOf(testRequest);
    if (requestIndex >= 0) requests.splice(requestIndex, 1);
  }
});

test('unaccepted chat opening reports a handled error and returns without throwing', async () => {
  const originalFetch = globalThis.fetch;
  signIn();
  const observedErrors = [];
  globalThis.fetch = async () => response({
    code: '42501',
    message: 'direct conversations require an unblocked accepted circle connection'
  }, 403);

  try {
    const subscription = await subscribeToBeaconChat(
      'unconnected-resident-test',
      (error) => observedErrors.push(error)
    );
    assert.equal(subscription, null);
    assert.equal(observedErrors.length, 1);
    assert.equal(observedErrors[0].code, '42501');
    assert.match(observedErrors[0].message, /accepted circle connection/);
  } finally {
    globalThis.fetch = originalFetch;
    clearSession();
    endSession();
  }
});
