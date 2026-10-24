function emptyState() {
  return {
    attribute: {
      tree: {
        type: 'group',
        combinator: 'AND',
        negate: false,
        children: []
      },
      boundary: null
    },
    spatial: {
      active: false,
      relationship: 'Intersects',
      geometry: null,
      distance: null,
      joinMode: 'AND'
    }
  };
}

let state = emptyState();
const subscribers = new Set();

function notify() {
  for (const subscriber of subscribers) subscriber(state);
}

export function get() {
  return state;
}

export function set(next) {
  if (!next || !next.attribute?.tree || !next.spatial) {
    throw new TypeError('Filter state must include attribute.tree and spatial.');
  }
  state = next;
  notify();
}

export function subscribe(fn) {
  if (typeof fn !== 'function') throw new TypeError('Filter subscriber must be a function.');
  subscribers.add(fn);
  fn(state);
  return () => subscribers.delete(fn);
}

export function reset() {
  state = emptyState();
  notify();
}
