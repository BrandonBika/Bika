/**
 * @file apps/resident-pwa/src/components/report-card/report-card.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import '../status-pill/status-pill.js';

export class CnReportCard extends BaseElement {
  set data(rep) {
    this._data = rep;
    this.render();
  }

  render() {
    if (!this._data) return;
    clearChildren(this);
    this.classList.add('cn-report-card');
    this.onclick = () => navigate('report-detail', { id: this._data.id || this._data.referenceNumber });

    const header = createElement('div', { cls: 'cn-report-card-header' });
    const ref = createElement('span', { cls: 'cn-report-card-ref', text: this._data.referenceNumber });
    const pill = createElement('cn-status-pill', { attrs: { status: this._data.status || 'open' } });
    header.appendChild(ref);
    header.appendChild(pill);

    const title = createElement('div', { cls: 'cn-report-card-title', text: this._data.title });
    const meta = createElement('div', { cls: 'cn-report-card-meta' });
    const cat = createElement('span', { text: this._data.category || 'General' });
    const date = createElement('span', { text: new Date(this._data.createdAt || Date.now()).toLocaleDateString() });
    meta.appendChild(cat);
    meta.appendChild(date);

    this.appendChild(header);
    this.appendChild(title);
    this.appendChild(meta);
  }
}
customElements.define('cn-report-card', CnReportCard);
