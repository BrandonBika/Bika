/**
 * @file apps/resident-pwa/src/pages/lifeline-contacts-picker/lifeline-contacts-picker.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageLifelineContactsPicker extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Pick from Contacts' });
    this.appendChild(h);
  }
}
customElements.define('page-lifeline-contacts-picker', PageLifelineContactsPicker);
