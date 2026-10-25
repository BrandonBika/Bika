import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const packageRoot = path.resolve(import.meta.dirname, '../../..', 'packages');
const registeredElements = new Map();

globalThis.HTMLElement ||= class {
  constructor() {
    this.firstChild = null;
    this.classList = { add() {} };
    this.isConnected = true;
  }

  removeChild() {}
};
globalThis.window ||= {
  location: { hash: '', pathname: '/', search: '', replace() {} },
  history: { back() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} },
  addEventListener() {},
  removeEventListener() {}
};
window.confirm ||= () => true;
globalThis.document ||= {
  body: {
    children: [],
    contains(element) {
      return this.children.includes(element);
    },
    appendChild(element) {
      this.children.push(element);
      element.parentNode = this;
    }
  },
  createElement() {
    return {
      classList: { add() {} },
      style: {},
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      appendChild(child) {
        child.parentNode = this;
        (this.children ||= []).push(child);
      },
      removeChild(child) {
        this.children = (this.children || []).filter((item) => item !== child);
        child.parentNode = null;
      },
      remove() {
        this.parentNode?.removeChild(this);
      }
    };
  }
};
globalThis.customElements ||= {
  define(name, element) {
    registeredElements.set(name, element);
  },
  get(name) {
    return registeredElements.get(name);
  }
};

const localStorageValues = new Map();
globalThis.localStorage ||= {
  getItem(key) { return localStorageValues.get(key) || null; },
  setItem(key, value) { localStorageValues.set(key, String(value)); },
  removeItem(key) { localStorageValues.delete(key); }
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@civicneuro/')) {
      const packageName = specifier.slice('@civicneuro/'.length);
      const entry = path.join(packageRoot, packageName, 'src', 'index.js');
      if (fs.existsSync(entry)) {
        return { url: pathToFileURL(entry).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  }
});

const { configureSupabaseClient } = await import('../../../packages/supabase-client/src/client.js');
const { setSession, clearSession } = await import('../../../packages/supabase-client/src/auth.js');
const {
  getChatMessages,
  refreshBeaconCircle,
  refreshChatMessages,
  subscribeBeacon,
  subscribeToBeaconChat
} = await import('../src/features/beacon/beacon.client.js');
const { PageBeaconChat } = await import('../src/pages/beacon-chat/beacon-chat.js');

configureSupabaseClient({
  url: 'https://beacon-chat-live-test.supabase.co',
  anonKey: 'public-test-key'
});

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static connections = [];
  static replies = 0;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    MockWebSocket.latest = this;
    MockWebSocket.connections.push(this);
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
      queueMicrotask(() => {
        MockWebSocket.replies += 1;
        this.onmessage?.({
          data: JSON.stringify([joinRef, ref, topic, 'phx_reply', reply])
        });
      });
    } else if (event === 'heartbeat') {
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify([null, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
      }));
    }
  }

  emit(frame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  close(options = {}) {
    this.readyState = MockWebSocket.CLOSED;
    queueMicrotask(() => this.onclose?.({ code: options.code || 1000 }));
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

test('an incoming Realtime message is rendered while the chat remains open', async () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const memberId = `live-render-${Date.now()}`;
  let rows = [];
  let messageFetchCount = 0;
  globalThis.WebSocket = MockWebSocket;
  setSession('resident-access-token', { id: 'resident-b' }, 'resident-refresh-token');
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/rpc/create_direct_conversation')) {
      return jsonResponse('conversation-live-render');
    }
    if (parsed.pathname.endsWith('/rpc/mark_conversation_read')) {
      return jsonResponse(null);
    }
    if (parsed.pathname.endsWith('/rpc/list_circle')) {
      return jsonResponse([{ user_id: memberId, display_name: 'Resident B' }]);
    }
    if (parsed.pathname.endsWith('/rpc/list_circle_requests')) {
      return jsonResponse([]);
    }
    if (parsed.pathname.endsWith('/messages')) {
      messageFetchCount += 1;
      return jsonResponse(rows);
    }
    assert.fail(`Unexpected request path: ${parsed.pathname}`);
  };

  let page;
  let subscription;
  try {
    await refreshChatMessages(memberId);
    page = Object.create(PageBeaconChat.prototype);
    page._memberId = memberId;
    page._unsubscribers = [];
    page.firstChild = null;
    page.isConnected = true;
    page.classList = { add() {} };
    page._opening = false;
    page._chatBody = {};
    page._textInput = { value: 'Draft stays in place' };
    const composerInput = page._textInput;
    page.renderedMessages = null;
    page.render = function renderForTest() {
      throw new Error('render() should not rebuild the composer during chat refresh');
    };
    page.renderMessages = function renderMessagesForTest() {
      this.renderedMessages = this._messages;
    };
    page.openConversation = async () => {};
    page.connectedCallback = function connectedCallbackForTest() {
      this._opening = false;
      this._chatBody = {};
      this._textInput = composerInput;
      this._unsubscribe = subscribeBeacon(() => {
        if (this.isConnected) {
          this._messages = getChatMessages(this._memberId);
          this.renderMessages();
        }
      });
    };
    page.connectedCallback();

    subscription = await subscribeToBeaconChat(memberId, (error) => {
      throw error;
    });
    await subscription.ready;
    const join = MockWebSocket.latest.sent.find((frame) => frame[3] === 'phx_join');
    assert.ok(join, 'conversation join was sent');
    const fetchesBeforeInsert = messageFetchCount;

    const message = {
      id: 'message-live-render',
      conversation_id: 'conversation-live-render',
      sender_id: 'resident-a',
      type: 'text',
      body: 'Realtime message visible',
      payload: null,
      created_at: '2026-10-23T09:00:00.000Z'
    };
    rows = [message];
    MockWebSocket.latest.emit([null, null, join[2], 'postgres_changes', {
      ids: ['1'],
      data: {
        schema: 'public',
        table: 'messages',
        commit_timestamp: message.created_at,
        type: 'INSERT',
        columns: [],
        record: message,
        old: {}
      }
    }]);

    for (let attempt = 0; attempt < 100
         && (messageFetchCount === fetchesBeforeInsert
           || !page.renderedMessages?.some((entry) => entry.id === message.id)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.ok(messageFetchCount > fetchesBeforeInsert, 'the INSERT triggered a messages refresh');
    assert.equal(
      page.renderedMessages?.some((entry) => entry.id === message.id),
      true,
      'the still-open page renders the newly fetched Realtime message'
    );
    assert.equal(page._textInput, composerInput, 'incoming messages do not replace the composer input');
    assert.equal(page._textInput.value, 'Draft stays in place', 'incoming messages preserve the draft');
  } finally {
    subscription?.unsubscribe();
    page?._unsubscribe?.();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    clearSession();
  }
});

test('a reconnect SUBSCRIBED catch-up refresh renders messages while the chat remains open', async () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const memberId = `reconnect-render-${Date.now()}`;
  let rows = [];
  let messageFetchCount = 0;
  globalThis.WebSocket = MockWebSocket;
  setSession(`resident-access-token-${memberId}`, { id: 'resident-b' }, 'resident-refresh-token');
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/rpc/create_direct_conversation')) {
      return jsonResponse('conversation-reconnect-render');
    }
    if (parsed.pathname.endsWith('/rpc/mark_conversation_read')) {
      return jsonResponse(null);
    }
    if (parsed.pathname.endsWith('/rpc/list_circle')) {
      return jsonResponse([{ user_id: memberId, display_name: 'Resident B' }]);
    }
    if (parsed.pathname.endsWith('/rpc/list_circle_requests')) {
      return jsonResponse([]);
    }
    if (parsed.pathname.endsWith('/messages')) {
      messageFetchCount += 1;
      return jsonResponse(rows);
    }
    assert.fail(`Unexpected request path: ${parsed.pathname}`);
  };

  let page;
  let subscription;
  const observedErrors = [];
  try {
    await refreshBeaconCircle();
    await refreshChatMessages(memberId);
    page = Object.create(PageBeaconChat.prototype);
    page._memberId = memberId;
    page._unsubscribers = [];
    page.firstChild = null;
    page.isConnected = true;
    page.classList = { add() {} };
    page._opening = false;
    page._chatBody = {};
    page._textInput = { value: 'Draft survives reconnect' };
    page.renderedMessages = null;
    page.renderMessages = function renderMessagesForTest() {
      this.renderedMessages = this._messages;
    };
    page._unsubscribe = subscribeBeacon(() => {
      if (page.isConnected) {
        page._messages = getChatMessages(page._memberId);
        page.renderMessages();
      }
    });

    subscription = await subscribeToBeaconChat(memberId, (error) => {
      observedErrors.push(error);
    });
    await subscription.ready;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const socketsBefore = MockWebSocket.connections.length;
    const repliesBefore = MockWebSocket.replies;
    const fetchesBeforeReconnect = messageFetchCount;
    rows = [{
      id: 'message-after-reconnect',
      conversation_id: 'conversation-reconnect-render',
      sender_id: 'resident-a',
      type: 'text',
      body: 'Reconnect catch-up visible',
      payload: null,
      created_at: '2026-10-23T09:01:00.000Z'
    }];

    MockWebSocket.latest.close({ code: 1006 });
    for (let attempt = 0; attempt < 1500
         && (MockWebSocket.connections.length === socketsBefore
           || MockWebSocket.replies === repliesBefore
           || messageFetchCount === fetchesBeforeReconnect
           || !page.renderedMessages?.some((entry) => entry.id === rows[0].id)); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(MockWebSocket.connections.length > socketsBefore, 'Realtime opened a replacement websocket');
    assert.ok(MockWebSocket.replies > repliesBefore, 'replacement websocket received a successful join reply');
    assert.ok(messageFetchCount > fetchesBeforeReconnect, 'the successful join triggered a messages catch-up fetch');
    assert.equal(
      page.renderedMessages?.some((entry) => entry.id === rows[0].id),
      true,
      'the reconnect SUBSCRIBED catch-up refresh renders the new message'
    );
  } finally {
    subscription?.unsubscribe();
    page?._unsubscribe?.();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
    clearSession();
  }
});

test('removing a chat member requires confirmation, calls the RPC, and closes the chat', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfirm = window.confirm;
  const originalHash = window.location.hash;
  const requests = [];
  const events = [];
  setSession('resident-action-token', { id: 'resident-a' }, 'resident-action-refresh');
  window.location.hash = '#beacon-chat?memberId=resident-b';
  window.confirm = (message) => {
    events.push('confirm');
    assert.match(message, /They will no longer see your chat or be able to message you/);
    return true;
  };
  globalThis.fetch = async (url, options) => {
    const pathname = new URL(url).pathname;
    requests.push({ pathname, body: options?.body ? JSON.parse(options.body) : null });
    events.push('request');
    return jsonResponse(pathname.endsWith('/rpc/list_circle') || pathname.endsWith('/rpc/list_circle_requests')
      ? []
      : null);
  };

  const page = Object.create(PageBeaconChat.prototype);
  page._member = { id: 'resident-b', name: 'Resident B' };
  page._memberId = 'resident-b';
  page._memberActionButtons = [{ disabled: false }, { disabled: false }];
  page._memberActionInProgress = false;
  page._closing = false;
  page.firstChild = null;
  page.isConnected = true;

  try {
    await page.runMemberAction('remove');
    assert.equal(events[0], 'confirm', 'confirmation is requested before any backend call');
    assert.equal(requests[0].pathname, '/rest/v1/rpc/remove_connection');
    assert.deepEqual(requests[0].body, { p_other_user_id: 'resident-b' });
    assert.equal(window.location.hash, 'beacon-home');
    assert.equal(page._closing, true, 'the chat closes after the removal succeeds');
  } finally {
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
    window.location.hash = originalHash;
    clearSession();
  }
});

test('a failed member action shows a safe error and keeps the chat open', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfirm = window.confirm;
  const originalHash = window.location.hash;
  setSession('resident-action-token', { id: 'resident-a' }, 'resident-action-refresh');
  window.location.hash = '#beacon-chat?memberId=resident-b';
  window.confirm = () => true;
  globalThis.fetch = async () => new Response('sensitive server detail', { status: 403 });

  const page = Object.create(PageBeaconChat.prototype);
  page._member = { id: 'resident-b', name: 'Resident B' };
  page._memberId = 'resident-b';
  page._memberActionButtons = [{ disabled: false }, { disabled: false }];
  page._memberActionInProgress = false;
  page._closing = false;
  page.firstChild = null;
  page.isConnected = true;

  try {
    await page.runMemberAction('block');
    assert.equal(window.location.hash, '#beacon-chat?memberId=resident-b');
    assert.equal(page._closing, false);
    assert.deepEqual(page._memberActionButtons.map((button) => button.disabled), [false, false]);
    assert.equal(
      document.body.children.at(-1).children.at(-1).textContent,
      'Could not update your circle. Please try again.'
    );
  } finally {
    globalThis.fetch = originalFetch;
    window.confirm = originalConfirm;
    window.location.hash = originalHash;
    clearSession();
  }
});
