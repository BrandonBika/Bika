/**
 * @file apps/resident-pwa/src/pages/empty-state/empty-state.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/empty-state/empty-state.js';

export class PageEmptyState extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    const empty = createElement('cn-empty-state');
    this.appendChild(empty);
  }
}
customElements.define('page-empty-state', PageEmptyState);
