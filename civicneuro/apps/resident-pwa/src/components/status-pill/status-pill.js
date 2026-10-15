/**
 * @file apps/resident-pwa/src/components/status-pill/status-pill.js
 * Status pill component matching CivicNeuro design spec.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

const STATUS_MAP = {
  review: { label: 'Review', cls: 'pill-review' },
  under_review: { label: 'Review', cls: 'pill-review' },
  open: { label: 'Review', cls: 'pill-review' },
  in_progress: { label: 'In progress', cls: 'pill-progress' },
  progress: { label: 'In progress', cls: 'pill-progress' },
  resolved: { label: 'Resolved', cls: 'pill-resolved' },
  escalated: { label: 'Escalated', cls: 'pill-escalated' },
  withdrawn: { label: 'Withdrawn', cls: 'pill-withdrawn' },
  queued: { label: 'Queued', cls: 'pill-queued' },
};

export class CnStatusPill extends BaseElement {
  static get observedAttributes() {
    return ['status'];
  }

  attributeChangedCallback() {
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    clearChildren(this);
    const raw = (this.getAttribute('status') || 'review').toLowerCase().trim();
    const config = STATUS_MAP[raw] || { label: raw, cls: 'pill-review' };

    this.className = `cn-status-pill ${config.cls}`;
    this.setAttribute('role', 'status');
    this.setAttribute('aria-label', `Status: ${config.label}`);

    const dot = createElement('span', { cls: 'dot', attrs: { 'aria-hidden': 'true' } });
    const text = createElement('span', { text: config.label });

    this.appendChild(dot);
    this.appendChild(text);
  }
}
customElements.define('cn-status-pill', CnStatusPill);

/**
 * Helper function to create a status pill DOM element safely.
 * @param {string} status
 * @returns {HTMLSpanElement}
 */
export function createStatusPill(status) {
  const raw = (status || 'review').toLowerCase().trim();
  const config = STATUS_MAP[raw] || { label: raw, cls: 'pill-review' };

  const pill = createElement('span', {
    cls: ['pill', config.cls],
    attrs: { role: 'status', 'aria-label': `Status: ${config.label}` }
  });
  const dot = createElement('span', { cls: 'dot', attrs: { 'aria-hidden': 'true' } });
  const text = createElement('span', { text: config.label });

  pill.appendChild(dot);
  pill.appendChild(text);
  return pill;
}
