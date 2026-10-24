import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addGroupMember,
  createDirect,
  createGroup,
  fetchAlertMessages,
  fetchMessages,
  leaveConversation,
  listConversations,
  markRead,
  sendAlert,
  sendLocation,
  sendPath,
  sendText,
  subscribeToConversation,
  unsubscribe
} from '../src/features/messaging/messaging.client.js';
import { setSession } from '../../../packages/supabase-client/src/auth.js';
import { configureSupabaseClient } from '../../../packages/supabase-client/src/client.js';

configureSupabaseClient({
  url: 'https://messaging-test.supabase.co',
  anonKey: 'public-test-key'
});
setSession('resident-access-token', { id: 'resident-a' }, 'resident-refresh-token');

test('conversation operations use resident RPCs and membership-scoped REST queries', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    const response = String(url).includes('/conversation_members?')
      ? [{
          conversation_id: 'conversation-1',
          role: 'admin',
          joined_at: '2026-10-20T00:00:00Z',
          last_read_at: null,
          conversation: {
            id: 'conversation-1',
            kind: 'group',
            title: 'Neighbours',
            created_by: 'resident-a',
            created_at: '2026-10-20T00:00:00Z'
          }
        }]
      : String(url).includes('/rpc/mark_conversation_read')
        ? null
        : 'conversation-1';
    return new Response(JSON.stringify(response), { status: 200 });
  };

  try {
    assert.equal(await createDirect('resident-b'), 'conversation-1');
    assert.equal(await createGroup('Neighbours', ['resident-b']), 'conversation-1');
    const conversations = await listConversations();
    assert.equal(conversations[0].id, 'conversation-1');
    assert.equal(conversations[0].role, 'admin');
    await markRead('conversation-1');

    assert.deepEqual(JSON.parse(requests[0].options.body), { p_other_user_id: 'resident-b' });
    assert.deepEqual(JSON.parse(requests[1].options.body), {
      p_title: 'Neighbours',
      p_member_ids: ['resident-b']
    });
    assert.equal(new URL(requests[2].url).searchParams.get('user_id'), 'eq.resident-a');
    assert.equal(requests[3].url, 'https://messaging-test.supabase.co/rest/v1/rpc/mark_conversation_read');
    await addGroupMember('conversation-1', 'resident-c');
    await leaveConversation('conversation-1');
    assert.equal(new URL(requests[4].url).pathname, '/rest/v1/rpc/add_group_member');
    assert.deepEqual(JSON.parse(requests[4].options.body), {
      p_conversation_id: 'conversation-1',
      p_user_id: 'resident-c'
    });
    assert.equal(new URL(requests[5].url).pathname, '/rest/v1/rpc/leave_conversation');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('message methods persist text, validated location, and validated paths', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify([{
      id: `message-${requests.length}`,
      conversation_id: 'conversation-1',
      type: JSON.parse(options.body).type
    }]), { status: 201 });
  };

  try {
    await sendText('conversation-1', ' hello ');
    await sendAlert('conversation-1', 'Safety alert');
    await sendLocation('conversation-1', { lat: -29.8, lng: 31.0, accuracy: 8 });
    await sendPath('conversation-1', [[-29.8, 31.0], [-29.81, 31.01]]);

    assert.deepEqual(JSON.parse(requests[0].options.body), {
      conversation_id: 'conversation-1',
      type: 'text',
      body: 'hello',
      payload: null
    });
    assert.deepEqual(JSON.parse(requests[1].options.body), {
      conversation_id: 'conversation-1',
      type: 'alert',
      body: 'Safety alert',
      payload: null
    });
    assert.deepEqual(JSON.parse(requests[2].options.body).payload, {
      lat: -29.8,
      lng: 31.0,
      accuracy: 8
    });
    assert.deepEqual(JSON.parse(requests[3].options.body).payload, {
      points: [[-29.8, 31.0], [-29.81, 31.01]]
    });
    assert.equal(new URL(requests[0].url).pathname, '/rest/v1/messages');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('alert messages are fetched by type and sent through the messaging table', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify(options.method === 'POST'
      ? [{ id: 'alert-message-1', type: 'alert', body: 'Safety notice' }]
      : [{ id: 'alert-message-1', type: 'alert', body: 'Safety notice' }]), { status: 200 });
  };

  try {
    const alerts = await fetchAlertMessages('conversation-alerts');
    assert.equal(alerts[0].type, 'alert');
    assert.equal(new URL(requests[0].url).searchParams.get('type'), 'eq.alert');
    assert.equal(new URL(requests[0].url).searchParams.get('conversation_id'), 'eq.conversation-alerts');

    await sendAlert('conversation-alerts', ' Safety notice ');
    assert.deepEqual(JSON.parse(requests[1].options.body), {
      conversation_id: 'conversation-alerts',
      type: 'alert',
      body: 'Safety notice',
      payload: null
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('message paging is bounded and uses the before timestamp', async () => {
  const originalFetch = globalThis.fetch;
  const requestUrls = [];
  globalThis.fetch = async (url) => {
    requestUrls.push(String(url));
    return new Response('[]', { status: 200 });
  };

  try {
    await fetchMessages('conversation-1', '2026-10-20T00:00:00Z', 20);
    const query = new URL(requestUrls[0]).searchParams;
    assert.equal(query.get('conversation_id'), 'eq.conversation-1');
    assert.equal(query.get('created_at'), 'lt.2026-10-20T00:00:00.000Z');
    assert.equal(query.get('limit'), '20');
    await fetchMessages('conversation-1', {
      id: '123e4567-e89b-42d3-a456-426614174000',
      created_at: '2026-10-20T00:00:00Z'
    });
    assert.equal(
      new URL(requestUrls[1]).searchParams.get('or'),
      '(created_at.lt.2026-10-20T00:00:00.000Z,and(created_at.eq.2026-10-20T00:00:00.000Z,id.lt.123e4567-e89b-42d3-a456-426614174000))'
    );
    await assert.rejects(fetchMessages('conversation-1', null, 101), /page size/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invalid inputs are rejected before any network request', async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response('[]', { status: 200 });
  };

  try {
    await assert.rejects(createDirect('resident-a'), /yourself/);
    await assert.rejects(createGroup(' ', []), /title/);
    await assert.rejects(sendText('conversation-1', ' '), /Text messages/);
    await assert.rejects(sendLocation('conversation-1', { lat: 91, lng: 0 }), /valid latitude/);
    await assert.rejects(sendPath('conversation-1', [[0, 0]]), /2 to 1000/);
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('conversation subscriptions use the official Supabase Realtime client', async () => {
  const originalWebSocket = globalThis.WebSocket;
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      this.sent = [];
      MockWebSocket.latest = this;
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.({});
      });
    }
    send(value) {
      const frame = JSON.parse(value);
      this.sent.push(frame);
      const [joinRef, ref, topic, event, payload] = frame;
      if (event === 'phx_join') {
        const invalidToken = payload.access_token === 'invalid-access-token';
        const response = invalidToken
          ? { status: 'error', response: { reason: 'JWT expired' } }
          : {
              status: 'ok',
              response: {
                postgres_changes: payload.config.postgres_changes.map((filter, index) => ({
                  ...filter,
                  id: String(index + 1)
                }))
              }
            };
        queueMicrotask(() => this.onmessage?.({
          data: JSON.stringify([joinRef, ref, topic, 'phx_reply', response])
        }));
      } else if (event === 'heartbeat') {
        queueMicrotask(() => this.onmessage?.({
          data: JSON.stringify([null, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
        }));
      } else if (event === 'phx_leave') {
        queueMicrotask(() => this.onmessage?.({
          data: JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
        }));
      }
    }
    close() {
      this.readyState = MockWebSocket.CLOSED;
      queueMicrotask(() => this.onclose?.({ code: 1000 }));
    }
  }
  globalThis.WebSocket = MockWebSocket;

  const subscriptions = [];
  try {
    const received = [];
    let subscribedCount = 0;
    const subscription = subscribeToConversation(
      'conversation-1',
      (change) => received.push(change),
      undefined,
      () => { subscribedCount += 1; }
    );
    subscriptions.push(subscription);
    await subscription.ready;
    assert.equal(subscribedCount, 1);
    const socket = MockWebSocket.latest;
    const endpoint = new URL(socket.url);
    assert.equal(endpoint.protocol, 'wss:');
    assert.equal(endpoint.pathname, '/realtime/v1/websocket');

    const join = socket.sent[0];
    assert.equal(join[3], 'phx_join');
    assert.equal(join[4].access_token, 'resident-access-token');
    assert.equal(join[4].config.postgres_changes.length, 2);
    assert.equal(join[4].config.postgres_changes[0].table, 'messages');
    assert.equal(join[4].config.postgres_changes[1].table, 'conversation_members');

    socket.onmessage({
      data: JSON.stringify([null, null, join[2], 'postgres_changes', {
        ids: ['1'],
        data: {
          schema: 'public',
          table: 'messages',
          type: 'INSERT',
          columns: [{ name: 'type', type: 'text' }],
          record: { type: 'text' }
        }
      }])
    });
    assert.deepEqual(received, [{
      schema: 'public',
      table: 'messages',
      commit_timestamp: undefined,
      eventType: 'INSERT',
      new: { type: 'text' },
      old: {},
      errors: undefined
    }]);

    unsubscribe(subscription);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(socket.sent.some((frame) => frame[3] === 'phx_leave'), true);

    setSession('invalid-access-token', { id: 'resident-a' }, 'resident-refresh-token');
    const invalidSubscription = subscribeToConversation('conversation-1', () => {}, () => {});
    subscriptions.push(invalidSubscription);
    await assert.rejects(invalidSubscription.ready, /JWT expired/);
    unsubscribe(invalidSubscription);
    subscriptions.splice(subscriptions.indexOf(invalidSubscription), 1);
  } finally {
    for (const subscription of subscriptions) unsubscribe(subscription);
    globalThis.WebSocket = originalWebSocket;
  }
});
