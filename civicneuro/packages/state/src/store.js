/**
 * @file packages/state/src/store.js
 * @description Tiny reactive store. No external dependencies.
 * Each store holds a value and notifies subscribers synchronously on change.
 *
 * @template T
 */

/**
 * @template T
 * @typedef {Object} Store
 * @property {() => T} get
 * @property {(val: T) => void} set
 * @property {(fn: (val: T) => void) => () => void} subscribe
 * @property {(fn: (val: T) => T) => void} update
 */

/**
 * Creates a reactive store.
 * @template T
 * @param {T} initialValue
 * @returns {Store<T>}
 */
export function createStore(initialValue) {
  let value = initialValue;
  /** @type {Set<(v: T) => void>} */
  const subscribers = new Set();

  return {
    get() {
      return value;
    },

    set(newValue) {
      if (Object.is(newValue, value)) return; // no-op on same reference
      value = newValue;
      for (const fn of subscribers) {
        try { fn(value); } catch { /* subscriber errors must not break others */ }
      }
    },

    update(fn) {
      this.set(fn(value));
    },

    subscribe(fn) {
      subscribers.add(fn);
      // Immediately call with current value (like Svelte stores)
      try { fn(value); } catch { /* ignore */ }
      // Return unsubscribe function
      return () => subscribers.delete(fn);
    },
  };
}

/**
 * Derives a read-only store from one or more source stores.
 * @template T
 * @param {Store<unknown>[]} stores
 * @param {(...values: unknown[]) => T} derive
 * @returns {Pick<Store<T>, 'get'|'subscribe'>}
 */
export function derived(stores, derive) {
  const compute = () => derive(...stores.map((s) => s.get()));
  let value = compute();
  /** @type {Set<(v: T) => void>} */
  const subscribers = new Set();

  const notify = () => {
    const next = compute();
    if (Object.is(next, value)) return;
    value = next;
    for (const fn of subscribers) {
      try { fn(value); } catch { /* ignore */ }
    }
  };

  for (const store of stores) {
    store.subscribe(notify);
  }

  return {
    get() { return value; },
    subscribe(fn) {
      subscribers.add(fn);
      try { fn(value); } catch { /* ignore */ }
      return () => subscribers.delete(fn);
    },
  };
}
