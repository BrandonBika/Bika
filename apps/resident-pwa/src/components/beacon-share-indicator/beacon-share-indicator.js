/**
 * @file apps/resident-pwa/src/components/beacon-share-indicator/beacon-share-indicator.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { sessionStore } from '../../session.js';
import { stopActiveSession } from '../../features/beacon/beacon.client.js';

export class CnBeaconShareIndicator extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-indicator');

    const span = createElement('span', {
      text: 'Beacon prototype active — location is not shared with others'
    });
    const stopBtn = createElement('button', {
      cls: 'cn-btn cn-btn--danger',
      text: 'Stop Prototype'
    });
    stopBtn.style.minHeight = '32px';
    stopBtn.style.padding = '4px 8px';
    stopBtn.style.fontSize = '0.75rem';

    stopBtn.onclick = async () => {
      await stopActiveSession();
      sessionStore.update((s) => ({ ...s, activeSharesCount: 0 }));
    };

    this.appendChild(span);
    this.appendChild(stopBtn);
  }
}
customElements.define('cn-beacon-share-indicator', CnBeaconShareIndicator);
