/**
 * @file apps/resident-pwa/src/components/progress-bar/progress-bar.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnProgressBar extends BaseElement {
  set progress(val) {
    const bar = this.querySelector('.cn-progress-inner');
    if (bar) bar.style.width = `${val}%`;
  }

  connectedCallback() {
    clearChildren(this);
    this.style.width = '100%';
    this.style.height = '6px';
    this.style.background = '#ebecf0';
    this.style.borderRadius = '3px';
    this.style.overflow = 'hidden';

    const inner = createElement('div', { cls: 'cn-progress-inner' });
    inner.style.height = '100%';
    inner.style.width = (this.getAttribute('value') || '0') + '%';
    inner.style.background = 'var(--cn-color-primary, #0052cc)';
    inner.style.transition = 'width 0.2s ease';

    this.appendChild(inner);
  }
}
customElements.define('cn-progress-bar', CnProgressBar);
