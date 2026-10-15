/**
 * @file apps/resident-pwa/src/pages/data-export/data-export.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { exportMyData } from '../../features/account/account.client.js';

export class PageDataExport extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Export My Personal Data' });
    const p = createElement('p', { text: 'Download a full copy of your profile, report records, and activity under POPIA Section 23/24.' });

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Generate & Download Data Archive (JSON)' });
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Generating archive…';
      await exportMyData();
      showToast('Data export download started', { type: 'success' });
      btn.disabled = false;
      btn.textContent = 'Generate & Download Data Archive (JSON)';
    };

    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(btn);
  }
}
customElements.define('page-data-export', PageDataExport);
