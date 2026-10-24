/**
 * @file packages/supabase-client/src/realtime.js
 * Supabase Realtime postgres_changes subscriptions plus the legacy local event bus.
 */
import { createClient } from '@supabase/supabase-js';

let realtimeConfig = null;
const realtimeClients = new Map();

export function configureRealtimeClient({ url, anonKey, getAccessToken }) {
  realtimeConfig = { url, anonKey, getAccessToken };
}

function getRealtimeClient(accessToken) {
  let entry = realtimeClients.get(accessToken);
  if (!entry) {
    const client = createClient(realtimeConfig.url, realtimeConfig.anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    });
    entry = {
      client,
      channels: new Set(),
      references: 0,
      authReady: client.realtime.setAuth(accessToken)
    };
    realtimeClients.set(accessToken, entry);
  }
  entry.references += 1;
  return entry;
}

function releaseClient(accessToken, entry) {
  entry.references -= 1;
  if (entry.references === 0 && realtimeClients.get(accessToken) === entry) {
    realtimeClients.delete(accessToken);
    entry.client.realtime.disconnect();
  }
}

export function subscribeToPostgresChanges({
  topic,
  changes,
  onChange,
  onError = console.error,
  onSubscribed = () => {}
}) {
  if (!realtimeConfig?.url || !realtimeConfig.anonKey) {
    throw new Error('Supabase Realtime is not configured.');
  }
  if (typeof realtimeConfig.getAccessToken !== 'function') {
    throw new Error('Supabase Realtime authentication is not configured.');
  }
  const accessToken = realtimeConfig.getAccessToken();
  if (!accessToken) {
    throw new Error('Sign in before subscribing to Supabase Realtime.');
  }
  if (typeof onChange !== 'function' || !Array.isArray(changes) || changes.length === 0) {
    throw new TypeError('Realtime changes and a callback are required.');
  }

  const entry = getRealtimeClient(accessToken);
  let channel = null;
  let closed = false;
  let released = false;
  let readySettled = false;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  const rejectReady = (error) => {
    if (readySettled) return;
    readySettled = true;
    readyReject(error);
  };

  const release = () => {
    if (released) return;
    released = true;
    releaseClient(accessToken, entry);
  };

  entry.authReady.then(() => {
    if (closed) {
      release();
      return;
    }

    channel = entry.client.channel(topic, { config: { private: false } });
    entry.channels.add(channel);
    for (const change of changes) {
      channel.on('postgres_changes', change, (payload) => {
        try {
          onChange(payload?.data || payload);
        } catch (error) {
          onError(error);
        }
      });
    }
    channel.subscribe((status, error) => {
      if (closed) return;
      if (status === 'SUBSCRIBED') {
        if (!readySettled) {
          readySettled = true;
          readyResolve();
        }
        try {
          onSubscribed();
        } catch (callbackError) {
          onError(callbackError);
        }
        return;
      }
      if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') {
        return;
      }

      const subscriptionError = error
        || new Error(`Supabase Realtime subscription ${status.toLowerCase()}.`);
      onError(subscriptionError);
      rejectReady(subscriptionError);
    });
  }).catch((error) => {
    onError(error);
    rejectReady(error);
    release();
  });

  return {
    ready,
    unsubscribe() {
      if (closed) return;
      closed = true;
      if (!channel) {
        release();
        return;
      }
      entry.channels.delete(channel);
      entry.client.removeChannel(channel).then((status) => {
        if (status !== 'ok' && status !== 'timed out') {
          onError(new Error(`Supabase Realtime channel removal ${status}.`));
        }
        release();
      }).catch((error) => {
        onError(error);
        release();
      });
    }
  };
}

export function subscribeToChannel(channelName, onMessage) {
  const handler = (event) => onMessage(event.detail);
  const eventName = `cn-channel:${channelName}`;
  window.addEventListener(eventName, handler);
  return {
    send(data) {
      window.dispatchEvent(new CustomEvent(eventName, { detail: data }));
    },
    unsubscribe() {
      window.removeEventListener(eventName, handler);
    }
  };
}
