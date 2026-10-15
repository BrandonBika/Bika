/**
 * @file apps/resident-pwa/src/components/offline-banner/offline-banner.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement, setText } from '@civicneuro/security-web';
import { triggerQueueSync, checkOfflineStatus } from '../../features/offline/offline.client.js';

export class CnOfflineBanner extends BaseElement {
  connectedCallback() {
    this.updateStatus();
    window.addEventListener('online', () => this.updateStatus());
    window.addEventListener('offline', () => this.updateStatus());
  }

  async updateStatus() {
    const status = await checkOfflineStatus();
    clearChildren(this);
    if (status.isOnline && status.queuedCount === 0) {
      this.classList.add('hidden');
      return;
    }
    this.classList.remove('hidden');
    this.classList.add('cn-offline-banner');

    const msg = !status.isOnline
      ? 'You are offline. Reports will be queued and synced automatically.'
      : `Syncing ${status.queuedCount} queued report(s)…`;

    const span = createElement('span', { text: msg });
    this.appendChild(span);

    if (status.isOnline && status.queuedCount > 0) {
      const syncBtn = createElement('button', { cls: 'cn-btn cn-btn--secondary', text: 'Sync Now' });
      syncBtn.onclick = async () => {
        await triggerQueueSync();
        this.updateStatus();
      };
      this.appendChild(syncBtn);
    }
  }
}
customElements.define('cn-offline-banner', CnOfflineBanner);
