/**
 * @file apps/resident-pwa/src/pages/report-submitted/report-submitted.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageReportSubmitted extends BaseElement {
  init(params) {
    this._ref = params.ref || 'CN-2026-0042';
    this._isGuest = params.isGuest === 'true';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-report-submitted');

    const icon = createElement('div', { cls: 'cn-report-submitted-icon', text: '✓', attrs: { 'aria-hidden': 'true' } });
    const title = createElement('h1', { cls: 'cn-report-submitted-title', text: this._isGuest ? 'Report submitted' : 'Report received' });
    const refBox = createElement('div', { cls: 'cn-report-reference' });

    refBox.appendChild(createElement('div', { cls: 'cn-report-reference-label', text: 'Your reference number' }));
    refBox.appendChild(createElement('div', { cls: 'cn-report-reference-value', text: this._ref || 'CN-2026-0042' }));

    const desc = createElement('p', {
      cls: 'cn-report-submitted-copy',
      text: this._isGuest
        ? 'Please save this number. You can use it with your phone or email to check progress.'
        : 'Your report has been routed to the relevant municipal department. You can track live updates in My reports.'
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
    homeBtn.onclick = () => navigate(this._isGuest ? 'register' : 'home');
    const actions = createElement('div', { cls: 'cn-report-actions' });
    actions.append(trackBtn, homeBtn);

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(refBox);
    this.appendChild(desc);
    if (this._isGuest) this.appendChild(guestNote);
    this.appendChild(actions);
  }
}
customElements.define('page-report-submitted', PageReportSubmitted);
