/**
 * @file packages/security-web/src/safe-dom.js
 * @description Safe DOM manipulation helpers.
 * NEVER USE innerHTML, outerHTML, insertAdjacentHTML, or document.write.
 * All user-supplied content must go through these helpers.
 */

import { escapeHtml } from './escape-html.js';

/**
 * Sets the text content of an element — the only safe way to display
 * user-provided strings.
 * @param {Element} el
 * @param {unknown} text
 */
export function setText(el, text) {
  el.textContent = text === null || text === undefined ? '' : String(text);
}

/**
 * Sets an attribute safely. If value is null/undefined the attribute is removed.
 * @param {Element} el
 * @param {string} attr
 * @param {unknown} value
 */
export function setAttr(el, attr, value) {
  if (value === null || value === undefined) {
    el.removeAttribute(attr);
  } else {
    el.setAttribute(attr, String(value));
  }
}

/**
 * Creates an element with optional class list and text content.
 * @param {string} tag
 * @param {{ cls?: string|string[], text?: unknown, attrs?: Record<string,unknown> }} [opts]
 * @returns {Element}
 */
export function createElement(tag, opts = {}) {
  const el = document.createElement(tag);
  if (opts.cls) {
    const classes = Array.isArray(opts.cls) ? opts.cls : opts.cls.split(' ');
    el.classList.add(...classes.filter(Boolean));
  }
  if (opts.text !== undefined) {
    setText(el, opts.text);
  }
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      setAttr(el, k, v);
    }
  }
  return el;
}

/**
 * Removes all children from an element.
 * @param {Element} el
 */
export function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Appends multiple children at once.
 * @param {Element} parent
 * @param {...(Node|null|undefined)} children
 */
export function append(parent, ...children) {
  for (const child of children) {
    if (child != null) parent.appendChild(child);
  }
}

/**
 * Safely builds a list of text items using <ul>/<li>.
 * @param {string[]} items
 * @param {{ ordered?: boolean }} [opts]
 * @returns {HTMLUListElement|HTMLOListElement}
 */
export function buildList(items, { ordered = false } = {}) {
  const list = document.createElement(ordered ? 'ol' : 'ul');
  for (const item of items) {
    const li = document.createElement('li');
    setText(li, item);
    list.appendChild(li);
  }
  return list;
}

/**
 * Parses an HTML template by id and clones its content.
 * SAFE: only imports static server-authored templates, not dynamic data.
 * @param {string} templateId
 * @returns {DocumentFragment}
 */
export function cloneTemplate(templateId) {
  const tmpl = document.getElementById(templateId);
  if (!tmpl || tmpl.tagName !== 'TEMPLATE') {
    throw new Error(`Template #${templateId} not found`);
  }
  return /** @type {HTMLTemplateElement} */ (tmpl).content.cloneNode(true);
}

/**
 * Parses a static HTML string (authored at build time, NOT runtime user data)
 * using DOMParser and returns the first element matching a selector.
 * NEVER pass user data to this function.
 * @param {string} staticHtml - Must be static, author-controlled markup.
 * @param {string} selector
 * @returns {DocumentFragment}
 */
export function parseStaticHtml(staticHtml, selector) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(staticHtml, 'text/html');
  const el = selector ? doc.querySelector(selector) : doc.body;
  if (!el) throw new Error(`Selector "${selector}" not found in parsed HTML`);
  const frag = document.createDocumentFragment();
  while (el.firstChild) frag.appendChild(el.firstChild);
  return frag;
}
