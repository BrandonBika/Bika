/**
 * @file apps/resident-pwa/src/pages/report-submitted/report-submitted.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { getLastSubmissionReceipt } from '../../features/reports/reports.client.js';

export class PageReportSubmitted extends BaseElement {
  init(params) {
    this._ref = params.ref || 'CN-2026-0042';
    this._isGuest = params.isGuest === 'true';
    const receipt = getLastSubmissionReceipt();
    this._lookupCode = receipt?.tracking_number === this._ref ? receipt.lookup_code : null;
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-report-submitted');

    const icon = createElement('div', { cls: 'cn-report-submitted-icon', text: '✓', attrs: { 'aria-hidden': 'true' } });
    const title = createElement('h1', { cls: 'cn-report-submitted-title', text: 'Report received' });
    const refBox = createElement('div', { cls: 'cn-report-reference' });

    refBox.appendChild(createElement('div', { cls: 'cn-report-reference-label', text: 'Your reference number' }));
    refBox.appendChild(createElement('div', { cls: 'cn-report-reference-value', text: this._ref || 'CN-2026-0042' }));

    const desc = createElement('p', {
      cls: 'cn-report-submitted-copy',
      text: this._isGuest
        ? 'Please save this tracking number.'
        : 'Your report has been received. You can track updates in My reports.'
    });

    const guestNote = createElement('div', { cls: 'cn-report-guest-note' });
    guestNote.appendChild(createElement('strong', { text: "As a guest, you won't get:" }));
    guestNote.appendChild(createElement('span', {
      text: 'a saved report history, in-app replies, push notifications, or badges. You can still check progress with your reference number.'
    }));

    const trackBtn = createElement('button', {
      cls: 'cn-report-primary',
      text: this._isGuest ? 'Track this report' : 'View report details',
      attrs: { type: 'button' }
    });
    trackBtn.onclick = () => this._isGuest
      ? navigate('track-report', { referenceNumber: this._ref })
      : navigate('report-detail', { id: this._ref });

    const homeBtn = createElement('button', {
      cls: 'cn-report-secondary',
      text: this._isGuest ? 'Create an account to save it' : 'Return to Home',
      attrs: { type: 'button' }
    });
    homeBtn.onclick = () => this._isGuest
      ? navigate('register')
      : navigate('home', {}, { replace: true });
    const actions = createElement('div', { cls: 'cn-report-actions' });
    actions.append(trackBtn, homeBtn);

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(refBox);
    this.appendChild(desc);
    if (this._isGuest) {
      this.appendChild(guestNote);
      if (this._lookupCode) {
        const lookupBox = createElement('div', { cls: 'cn-report-lookup-code' });
        lookupBox.appendChild(createElement('strong', { text: 'Your one-time lookup code' }));
        lookupBox.appendChild(createElement('div', { text: this._lookupCode, attrs: { role: 'text' } }));
        lookupBox.appendChild(createElement('p', {
          text: 'Save this code with your tracking number. You will need both to check this report later.'
        }));
        this.appendChild(lookupBox);
      }
    }
    this.appendChild(actions);
  }
}
customElements.define('page-report-submitted', PageReportSubmitted);
