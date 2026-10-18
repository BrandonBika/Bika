/**
 * @file apps/resident-pwa/src/pages/your-area/your-area.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/back-button/back-button.js';

export class PageYourArea extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'home' } }));
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Your Ward & Municipality' });
    const card = createElement('div');
    card.style.background = '#fff';
    card.style.border = '1px solid #dfe1e6';
    card.style.borderRadius = '12px';
    card.style.padding = '16px';

    const w = createElement('h3', { text: 'Ward 110 — eThekwini' });
    const c = createElement('p', { text: 'Councillor: Cllr. A. Dlamini\nRefuse Collection: Wednesdays\nSAPS Sector: Sector 2 Durban North' });

    card.appendChild(w);
    card.appendChild(c);
    this.appendChild(h);
    this.appendChild(card);
  }
}
customElements.define('page-your-area', PageYourArea);
