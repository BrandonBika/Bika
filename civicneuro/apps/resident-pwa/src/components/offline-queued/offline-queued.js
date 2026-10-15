/**
 * @file apps/resident-pwa/src/components/offline-queued/offline-queued.js
 * Offline / queued-submission state pattern (Screen D in design spec).
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class CnOfflineQueued extends BaseElement {
  connectedCallback() {
    this.render();
  }

  render() {
    clearChildren(this);
    this.classList.add('cn-queued-container');

    const iconWrap = createElement('div', { cls: 'cn-queued-icon-wrap' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    // Sunburst / spinner rays
    const paths = [
      'M12 2v4', 'M12 18v4',
      'M4.9 4.9l2.8 2.8', 'M16.3 16.3l2.8 2.8',
      'M2 12h4', 'M18 12h4',
      'M4.9 19.1l2.8-2.8', 'M16.3 7.7l2.8-2.8'
    ];
    for (const d of paths) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    iconWrap.appendChild(svg);

    const title = createElement('div', { cls: 'cn-queued-title', text: 'Saved — no connection' });
    const body = createElement('div', {
      cls: 'cn-queued-msg',
      text: "Your report is queued on this device and will submit automatically once you're back online. You won't get a reference number until then."
    });

    const actions = createElement('div', { cls: 'cn-queued-actions' });
    const backBtn = createElement('button', {
      cls: 'cn-queued-btn-primary',
      attrs: { type: 'button' },
      text: 'Back to My reports'
    });
    backBtn.onclick = () => navigate('my-reports');
    actions.appendChild(backBtn);

    this.appendChild(iconWrap);
    this.appendChild(title);
    this.appendChild(body);
    this.appendChild(actions);
  }
}
customElements.define('cn-offline-queued', CnOfflineQueued);

/**
 * Creates an offline-queued state element safely.
 * @param {() => void} [onBack]
 * @returns {HTMLDivElement}
 */
export function createOfflineQueued(onBack = null) {
  const container = createElement('div', { cls: 'cn-queued-container' });

  const iconWrap = createElement('div', { cls: 'cn-queued-icon-wrap' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const paths = [
    'M12 2v4', 'M12 18v4',
    'M4.9 4.9l2.8 2.8', 'M16.3 16.3l2.8 2.8',
    'M2 12h4', 'M18 12h4',
    'M4.9 19.1l2.8-2.8', 'M16.3 7.7l2.8-2.8'
  ];
  for (const d of paths) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  iconWrap.appendChild(svg);

  const titleEl = createElement('div', { cls: 'cn-queued-title', text: 'Saved — no connection' });
  const bodyEl = createElement('div', {
    cls: 'cn-queued-msg',
    text: "Your report is queued on this device and will submit automatically once you're back online. You won't get a reference number until then."
  });

  const actions = createElement('div', { cls: 'cn-queued-actions' });
  const backBtn = createElement('button', {
    cls: 'cn-queued-btn-primary',
    attrs: { type: 'button' },
    text: 'Back to My reports'
  });
  backBtn.onclick = onBack || (() => navigate('my-reports'));
  actions.appendChild(backBtn);

  container.appendChild(iconWrap);
  container.appendChild(titleEl);
  container.appendChild(bodyEl);
  container.appendChild(actions);

  return container;
}
