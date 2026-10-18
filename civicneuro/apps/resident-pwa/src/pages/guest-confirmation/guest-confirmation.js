/**
 * @file apps/resident-pwa/src/pages/guest-confirmation/guest-confirmation.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageGuestConfirmation extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Guest Action Confirmation' });
    const trackButton = createElement('button', {
      text: 'Track a report',
      attrs: { type: 'button' }
    });
    trackButton.addEventListener('click', () => navigate('track-report'));
    const welcomeButton = createElement('button', {
      text: 'Return to Welcome',
      attrs: { type: 'button' }
    });
    welcomeButton.addEventListener('click', () => navigate('welcome'));
    this.append(h, trackButton, welcomeButton);
  }
}
customElements.define('page-guest-confirmation', PageGuestConfirmation);
