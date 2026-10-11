/**
 * @file packages/ui/src/base-element.js
 * @description Base custom element class providing standard lifecycle,
 * state binding, and safe DOM helper utilities.
 */

import { setText, setAttr, clearChildren, append, createElement } from '@civicneuro/security-web';

export class BaseElement extends HTMLElement {
  constructor() {
    super();
    /** @type {Array<() => void>} */
    this._unsubscribers = [];
  }

  /**
   * Called when element is added to DOM.
   */
  connectedCallback() {
    this.render();
  }

  /**
   * Called when element is removed from DOM.
   */
  disconnectedCallback() {
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];
  }

  /**
   * Subscribe to a state store with auto-cleanup on disconnect.
   * @param {{ subscribe: (cb: (val: any) => void) => () => void }} store
   * @param {(val: any) => void} callback
   */
  subscribe(store, callback) {
    if (store && typeof store.subscribe === 'function') {
      const unsub = store.subscribe(callback);
      this._unsubscribers.push(unsub);
    }
  }

  /**
   * Override in child classes. Safe rendering only.
   */
  render() {}

  /**
   * Helper to set text content safely.
   * @param {Element} el
   * @param {unknown} text
   */
  setText(el, text) {
    setText(el, text);
  }

  /**
   * Helper to set attributes safely.
   * @param {Element} el
   * @param {string} attr
   * @param {unknown} value
   */
  setAttr(el, attr, value) {
    setAttr(el, attr, value);
  }

  /**
   * Helper to clear children.
   * @param {Element} el
   */
  clear(el) {
    clearChildren(el);
  }

  /**
   * Helper to create element.
   * @param {string} tag
   * @param {{ cls?: string|string[], text?: unknown, attrs?: Record<string,unknown> }} [opts]
   */
  create(tag, opts) {
    return createElement(tag, opts);
  }
}
