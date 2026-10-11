/**
 * @file apps/resident-pwa/src/components/empty-state/empty-state.js
 * Reusable empty state component (Screen B in design spec).
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnEmptyState extends BaseElement {
  static get observedAttributes() {
    return ['title', 'message'];
  }

  attributeChangedCallback() {
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    clearChildren(this);
    this.classList.add('cn-empty-container');

    const iconWrap = createElement('div', { cls: 'cn-empty-icon-wrap' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p1.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p2.setAttribute('d', 'M14 2v6h6');
    svg.appendChild(p1);
    svg.appendChild(p2);
    iconWrap.appendChild(svg);

    const titleText = this.getAttribute('title') || 'No reports yet';
    const msgText = this.getAttribute('message') || "When you report an issue it'll show up here so you can track it.";

    const title = createElement('div', { cls: 'cn-empty-title', text: titleText });
    const msg = createElement('div', { cls: 'cn-empty-msg', text: msgText });

    this.appendChild(iconWrap);
    this.appendChild(title);
    this.appendChild(msg);
  }
}
customElements.define('cn-empty-state', CnEmptyState);

/**
 * Creates an empty state element safely.
 * @param {string} title
 * @param {string} message
 * @param {HTMLElement} [actionEl]
 * @returns {HTMLDivElement}
 */
export function createEmptyState(title = 'No reports yet', message = "When you report an issue it'll show up here so you can track it.", actionEl = null, icon = 'file') {
  const container = createElement('div', { cls: 'cn-empty-container' });

  const iconWrap = createElement('div', { cls: 'cn-empty-icon-wrap' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  if (icon === 'bell') {
    const bell = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bell.setAttribute('d', 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10 21h4');
    svg.appendChild(bell);
  } else {
    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p1.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p2.setAttribute('d', 'M14 2v6h6');
    svg.appendChild(p1);
    svg.appendChild(p2);
  }
  iconWrap.appendChild(svg);

  const titleEl = createElement('div', { cls: 'cn-empty-title', text: title });
  const msgEl = createElement('div', { cls: 'cn-empty-msg', text: message });

  container.appendChild(iconWrap);
  container.appendChild(titleEl);
  container.appendChild(msgEl);

  if (actionEl) {
    const actionWrap = createElement('div', { cls: 'cn-empty-action' });
    actionWrap.appendChild(actionEl);
    container.appendChild(actionWrap);
  }

  return container;
}
