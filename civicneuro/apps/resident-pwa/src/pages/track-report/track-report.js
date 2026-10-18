/**
 * @file apps/resident-pwa/src/pages/track-report/track-report.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { trackGuestReport } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';
import '../../components/back-button/back-button.js';
import '../../components/captcha-widget/captcha-widget.js';

export class PageTrackReport extends BaseElement {
  init(params) {
    this._referenceNumber = params.referenceNumber || params.id || '';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page', 'cn-track-report-page');
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'welcome' } }));

    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Track a report' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'Enter the tracking number and lookup code from your confirmation.' });

    const refInput = createElement('cn-input', {
      attrs: { label: 'Reference number', placeholder: 'e.g. CN-2026-0042', value: this._referenceNumber, required: 'true' }
    });
    const codeInput = createElement('cn-input', {
      attrs: { label: 'Lookup code', placeholder: 'Enter the code shown when you submitted', required: 'true' }
    });
    const captcha = createElement('cn-captcha-widget');

    const btn = createElement('button', {
      cls: 'cn-btn cn-btn--primary cn-btn--full cn-auth-submit',
      text: 'View status',
      attrs: { type: 'button' }
    });

    btn.onclick = async () => {
      if (!refInput.value.trim() || !codeInput.value.trim()) {
        showToast('Enter the tracking number and lookup code', { type: 'error' });
        return;
      }
      try {
        btn.disabled = true;
        btn.textContent = 'Searching…';
        const rep = await trackGuestReport(
          refInput.value.trim(),
          codeInput.value.trim(),
          captcha.token
        );
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
    this.appendChild(codeInput);
    this.appendChild(captcha);
    this.appendChild(btn);
  }
}
customElements.define('page-track-report', PageTrackReport);
