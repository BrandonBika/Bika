/**
 * @file apps/resident-pwa/src/pages/offline-queued/offline-queued.js
 * Screen D: Offline / Queued submission page.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/offline-queued/offline-queued.js';
import { navigate } from '../../router.js';

export class PageOfflineQueued extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-offline-queued-page');

    const queued = createElement('cn-offline-queued');
    this.appendChild(queued);
  }
}
customElements.define('page-offline-queued', PageOfflineQueued);
