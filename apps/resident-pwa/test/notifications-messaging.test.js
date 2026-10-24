import assert from 'node:assert/strict';
import test from 'node:test';
import { configureSupabaseClient } from '../../../packages/supabase-client/src/client.js';
import { clearSession } from '../../../packages/supabase-client/src/auth.js';
import { endSession, startGuestSession, startResidentSession } from '../src/session.js';

const localStorageValues = new Map();
globalThis.localStorage = {
  getItem(key) { return localStorageValues.get(key) || null; },
  setItem(key, value) { localStorageValues.set(key, String(value)); },
  removeItem(key) { localStorageValues.delete(key); }
};

const {
  getNotifications,
  prepareNotificationsForSession,
  refreshMessagingAlerts,
  subscribeToMessagingAlerts
} = await import('../src/features/notifications/notifications.store.js');

configureSupabaseClient({
  url: 'https://notification-messaging-test.supabase.co',
  anonKey: 'public-test-key'
});

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
      const reply = {
        status: 'ok',
        response: {
          postgres_changes: payload.config.postgres_changes.map((change, index) => ({
            ...change,
            id: String(index + 1)
          }))
        }
      };
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify([joinRef, ref, topic, 'phx_reply', reply])
      }));
    } else if (event === 'heartbeat') {
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify([null, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
      }));
    }
  }

  emit(frame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    queueMicrotask(() => this.onclose?.({ code: 1000 }));
  }
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { status: 200 });
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail('Timed out waiting for the alert notification update.');
}

test('resident Alerts fetches alert messages and refreshes from conversation Realtime changes', async () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  let messages = [{
    id: 'alert-row-initial',
    conversation_id: 'conversation-notifications',
    sender_id: 'resident-a',
    type: 'alert',
    body: 'Initial safety alert',
    payload: null,
    created_at: '2026-10-23T08:00:00.000Z'
  }];
  let alertFetchCount = 0;
  globalThis.WebSocket = MockWebSocket;
  startResidentSession('notification-access-token', { id: 'resident-b' }, 'notification-refresh-token');
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/conversation_members')) {
      return jsonResponse([{
        conversation_id: 'conversation-notifications',
        role: 'member',
        joined_at: '2026-10-23T07:00:00.000Z',
        last_read_at: null,
        conversation: {
          id: 'conversation-notifications',
          kind: 'direct',
          title: null,
          created_by: 'resident-a',
          created_at: '2026-10-23T07:00:00.000Z'
        }
      }]);
    }
    if (parsed.pathname.endsWith('/messages')) {
      assert.equal(parsed.searchParams.get('type'), 'eq.alert');
      alertFetchCount += 1;
      return jsonResponse(messages);
    }
    assert.fail(`Unexpected notification request: ${parsed.pathname}`);
  };

  let subscription;
  try {
    prepareNotificationsForSession();
    assert.equal(
      getNotifications().some((notification) => notification.id.startsWith('notification-')),
      false,
      'authenticated users do not see local fixture notifications while real alerts load'
    );
    await refreshMessagingAlerts();
    assert.ok(getNotifications().some((notification) => (
      notification.id === 'messaging-alert-alert-row-initial'
      && notification.body === 'Initial safety alert'
      && notification.isMessagingAlert
    )));

    subscription = await subscribeToMessagingAlerts((error) => {
      throw error;
    });
    await subscription.ready;
    await waitFor(() => alertFetchCount >= 2);
    const join = MockWebSocket.latest.sent.find((frame) => frame[3] === 'phx_join');
    assert.ok(join, 'Alerts joined the resident conversation topic');

    messages = [...messages, {
      id: 'alert-row-realtime',
      conversation_id: 'conversation-notifications',
      sender_id: 'resident-a',
      type: 'alert',
      body: 'Live safety alert',
      payload: null,
      created_at: '2026-10-23T08:01:00.000Z'
    }];
    MockWebSocket.latest.emit([null, null, join[2], 'postgres_changes', {
      ids: ['1'],
      data: {
        schema: 'public',
        table: 'messages',
        type: 'INSERT',
        commit_timestamp: '2026-10-23T08:01:00.000Z',
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'conversation_id', type: 'uuid' },
          { name: 'sender_id', type: 'uuid' },
          { name: 'type', type: 'text' },
          { name: 'body', type: 'text' },
          { name: 'payload', type: 'jsonb' },
          { name: 'created_at', type: 'timestamp with time zone' }
        ],
        record: messages.at(-1),
        old: {}
      }
    }]);

    await waitFor(() => getNotifications().some(
      (notification) => notification.body === 'Live safety alert'
    ));
    assert.ok(alertFetchCount >= 3, 'a Realtime change triggered a new alert fetch');
  } finally {
    subscription?.unsubscribe();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    clearSession();
    endSession();
  }
});

test('guest Alerts retain local fallback notices without requesting resident messaging data', async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error('Guest Alerts must not call the resident messaging backend.');
  };

  try {
    startGuestSession('guest-notification-token', { id: 'guest-resident' });
    await refreshMessagingAlerts();
    assert.equal(networkCalls, 0);
    assert.ok(getNotifications().some((notification) => notification.id === 'notification-community-loadshedding'));
    assert.equal(getNotifications().some((notification) => notification.isMessagingAlert), false);
  } finally {
    globalThis.fetch = originalFetch;
    clearSession();
    endSession();
  }
});
