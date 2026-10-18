/**
 * @file apps/resident-pwa/src/pages/community-pulse/community-pulse.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/back-button/back-button.js';

export class PageCommunityPulse extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'home' } }));
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Community Pulse' });
    const p = createElement('p', { text: 'Real-time metrics on service delivery and issue resolution in Ward 110.' });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-community-pulse', PageCommunityPulse);
