/**
 * @file apps/resident-pwa/src/pages/safety-info/safety-info.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/back-button/back-button.js';

export class PageSafetyInfo extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'menu' } }));
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Community Safety' });
    const p = createElement('p', { text: 'Safety tips, emergency hotlines, and CPF sector information.' });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-safety-info', PageSafetyInfo);
