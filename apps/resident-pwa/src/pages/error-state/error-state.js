/**
 * @file apps/resident-pwa/src/pages/error-state/error-state.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/error-state/error-state.js';

export class PageErrorState extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    const err = createElement('cn-error-state');
    this.appendChild(err);
  }
}
customElements.define('page-error-state', PageErrorState);
