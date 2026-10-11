/**
 * @file apps/resident-pwa/src/pages/track-report/track-report.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { trackGuestReport } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';
import '../../components/captcha-widget/captcha-widget.js';

export class PageTrackReport extends BaseElement {
  init(params) {
    this._referenceNumber = params.referenceNumber || params.id || '';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page', 'cn-track-report-page');

    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Track a report' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'No account needed — enter the details from your confirmation.' });

    const refInput = createElement('cn-input', {
      attrs: { label: 'Reference number', placeholder: 'e.g. CN-2026-0042', value: this._referenceNumber, required: 'true' }
    });
    const contactInput = createElement('cn-input', {
      attrs: { label: 'Cellphone number or email used', placeholder: 'Used when submitting', required: 'true' }
    });
    const captcha = createElement('cn-captcha-widget');

    const btn = createElement('button', {
      cls: 'cn-btn cn-btn--primary cn-btn--full cn-auth-submit',
      text: 'View status',
      attrs: { type: 'button' }
    });

    btn.onclick = async () => {
      if (!refInput.value.trim() || !contactInput.value.trim()) {
        showToast('Enter the reference number and contact details', { type: 'error' });
        return;
      }
      try {
        btn.disabled = true;
        btn.textContent = 'Searching…';
        const rep = await trackGuestReport(refInput.value.trim(), contactInput.value.trim());
        navigate('report-detail', { id: rep.referenceNumber });
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'View status';
        // Generic message prevents enumeration
        showToast('No matching report found for these details.', { type: 'error' });
      }
    };

    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(refInput);
    this.appendChild(contactInput);
    this.appendChild(captcha);
    this.appendChild(btn);
  }
}
customElements.define('page-track-report', PageTrackReport);
