/**
 * @file apps/resident-pwa/src/pages/safety-info/safety-info.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageSafetyInfo extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Community Safety' });
    const p = createElement('p', { text: 'Safety tips, emergency hotlines, and CPF sector information.' });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-safety-info', PageSafetyInfo);
