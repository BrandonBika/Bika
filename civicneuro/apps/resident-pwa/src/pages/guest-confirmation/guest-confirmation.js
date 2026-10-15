/**
 * @file apps/resident-pwa/src/pages/guest-confirmation/guest-confirmation.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageGuestConfirmation extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Guest Action Confirmation' });
    this.appendChild(h);
  }
}
customElements.define('page-guest-confirmation', PageGuestConfirmation);
