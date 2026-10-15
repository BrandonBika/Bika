/**
 * @file apps/resident-pwa/src/components/error-state/error-state.js
 * Reusable full-screen error state pattern (Screen C in design spec).
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnErrorState extends BaseElement {
  static get observedAttributes() {
    return ['title', 'error-msg', 'show-offline'];
  }

  attributeChangedCallback() {
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    clearChildren(this);
    this.classList.add('cn-error-container');

    const iconWrap = createElement('div', { cls: 'cn-error-icon-wrap' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p1.setAttribute('d', 'M12 9v4M12 17h.01');
    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p2.setAttribute('d', 'M10.3 3.86 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z');
    svg.appendChild(p1);
    svg.appendChild(p2);
    iconWrap.appendChild(svg);

    const titleText = this.getAttribute('title') || "Couldn't load your reports";
    const bodyText = this.getAttribute('error-msg') || 'Something went wrong on our end. Your details are still filled in below — try again.';

    const title = createElement('div', { cls: 'cn-error-title', text: titleText });
    const body = createElement('div', { cls: 'cn-error-msg', text: bodyText });

    const actions = createElement('div', { cls: 'cn-error-actions' });
    const retryBtn = createElement('button', {
      cls: 'cn-error-btn-primary',
      attrs: { type: 'button' },
      text: 'Try again'
    });
    retryBtn.onclick = () => {
      this.dispatchEvent(new CustomEvent('retry', { bubbles: true }));
    };
    actions.appendChild(retryBtn);

    if (this.getAttribute('show-offline') === 'true') {
      const offlineBtn = createElement('button', {
        cls: 'cn-error-btn-secondary',
        attrs: { type: 'button' },
        text: 'Save offline instead'
      });
      offlineBtn.onclick = () => {
        this.dispatchEvent(new CustomEvent('save-offline', { bubbles: true }));
      };
      actions.appendChild(offlineBtn);
    }

    this.appendChild(iconWrap);
    this.appendChild(title);
    this.appendChild(body);
    this.appendChild(actions);
  }
}
customElements.define('cn-error-state', CnErrorState);

/**
 * Creates an error state element safely.
 * @param {Object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.message]
 * @param {() => void} [opts.onRetry]
 * @param {() => void} [opts.onSaveOffline]
 * @returns {HTMLDivElement}
 */
export function createErrorState({
  title = "Couldn't load your reports",
  message = 'Something went wrong on our end. Your details are still filled in below — try again.',
  onRetry = null,
  onSaveOffline = null
} = {}) {
  const container = createElement('div', { cls: 'cn-error-container' });

  const iconWrap = createElement('div', { cls: 'cn-error-icon-wrap' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'M12 9v4M12 17h.01');
  const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p2.setAttribute('d', 'M10.3 3.86 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z');
  svg.appendChild(p1);
  svg.appendChild(p2);
  iconWrap.appendChild(svg);

  const titleEl = createElement('div', { cls: 'cn-error-title', text: title });
  const bodyEl = createElement('div', { cls: 'cn-error-msg', text: message });

  const actions = createElement('div', { cls: 'cn-error-actions' });
  const retryBtn = createElement('button', {
    cls: 'cn-error-btn-primary',
    attrs: { type: 'button' },
    text: 'Try again'
  });
  if (onRetry) retryBtn.onclick = onRetry;
  actions.appendChild(retryBtn);

  if (onSaveOffline) {
    const offlineBtn = createElement('button', {
      cls: 'cn-error-btn-secondary',
      attrs: { type: 'button' },
      text: 'Save offline instead'
    });
    offlineBtn.onclick = onSaveOffline;
    actions.appendChild(offlineBtn);
  }

  container.appendChild(iconWrap);
  container.appendChild(titleEl);
  container.appendChild(bodyEl);
  container.appendChild(actions);

  return container;
}
