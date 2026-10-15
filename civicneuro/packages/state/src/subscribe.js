/**
 * @file packages/state/src/subscribe.js
 * @description Utility to bind a store to a DOM element's lifecycle.
 * Auto-unsubscribes when element disconnects.
 */

/**
 * Subscribes to a store and auto-cleans up when the element disconnects.
 * Typically called from a Web Component's connectedCallback.
 *
 * @param {HTMLElement} element - The Web Component host.
 * @param {{ subscribe: (fn: (v: unknown) => void) => () => void }} store
 * @param {(value: unknown) => void} onChange
 * @returns {() => void} unsubscribe function
 */
export function bindStore(element, store, onChange) {
  const unsub = store.subscribe(onChange);

  const obs = new MutationObserver(() => {
    if (!element.isConnected) {
      unsub();
      obs.disconnect();
    }
  });

  if (element.parentNode) {
    obs.observe(element.parentNode, { childList: true, subtree: true });
  }

  return unsub;
}
