/**
 * @file apps/resident-pwa/src/pages/pilot-org-select/pilot-org-select.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/back-button/back-button.js';

export class PagePilotOrgSelect extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'account' } }));
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Pilot Municipality Selection' });
    this.appendChild(h);
  }
}
customElements.define('page-pilot-org-select', PagePilotOrgSelect);
