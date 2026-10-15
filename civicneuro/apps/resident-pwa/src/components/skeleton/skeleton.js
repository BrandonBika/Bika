/**
 * @file apps/resident-pwa/src/components/skeleton/skeleton.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnSkeleton extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '16px';
    for (let i = 0; i < 4; i++) {
      const box = createElement('div', { cls: 'cn-skeleton-box' });
      box.style.height = (i === 0 ? 40 : 80) + 'px';
      this.appendChild(box);
    }
  }
}
customElements.define('cn-skeleton', CnSkeleton);
