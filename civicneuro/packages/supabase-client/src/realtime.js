/**
 * @file packages/supabase-client/src/realtime.js
 * Realtime channel subscription helper (private channels only).
 */
export function subscribeToChannel(channelName, onMessage) {
  // In mock environment or WebSockets
  const handler = (event) => onMessage(event.detail);
  window.addEventListener(`cn-channel:${channelName}`, handler);
  return {
    send: (data) => {
      window.dispatchEvent(new CustomEvent(`cn-channel:${channelName}`, { detail: data }));
    },
    unsubscribe: () => {
      window.removeEventListener(`cn-channel:${channelName}`, handler);
    }
  };
}
