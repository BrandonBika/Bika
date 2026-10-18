/**
 * @file apps/resident-pwa/src/pages/report-reopen-escalate/report-reopen-escalate.js
 * Screen J: Dispute / Reopen report standalone page.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getReportById, reopenReportById } from '../../features/reports/reports.store.js';
import { goBack, navigate } from '../../router.js';

export class PageReportReopenEscalate extends BaseElement {
  init(params) {
    this._id = params?.id || 'CN-2026-04289';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-reopen-page');

    const report = getReportById(this._id);
    const orgName = report?.organisation?.name || 'eThekwini Water & Sanitation';
    const ref = report?.referenceNumber || this._id;

    const wrap = createElement('div', {
      attrs: {
        style: 'padding: 24px 16px; max-width: 440px; margin: 0 auto;'
      }
    });

    const title = createElement('div', {
      cls: 'sheet-title',
      attrs: { style: 'font-size: 18px; margin-bottom: 4px;' },
      text: "Tell us what's still wrong"
    });

    const sub = createElement('div', {
      cls: 'sheet-sub',
      text: `This reopens ${ref} and escalates it to ${orgName}'s supervisor queue.`
    });

    const label = createElement('div', { cls: 'm-field-label', text: 'DETAILS' });
    const textarea = createElement('textarea', {
      cls: 'm-textfield',
      attrs: {
        placeholder: 'The drain is clear but water is still pooling after rain…',
        id: 'reopen-page-details'
      }
    });

    const btnRow = createElement('div', { cls: 'btn-row' });
    const cancelBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button' },
      text: 'Cancel'
    });
    cancelBtn.onclick = () => goBack('report-detail', { id: this._id });

    const submitBtn = createElement('button', {
      cls: ['btn-flat', 'primary'],
      attrs: { type: 'button', disabled: 'true' },
      text: 'Reopen report'
    });

    textarea.oninput = () => {
      if (textarea.value.trim()) {
        submitBtn.removeAttribute('disabled');
      } else {
        submitBtn.setAttribute('disabled', 'true');
      }
    };

    submitBtn.onclick = () => {
      const details = textarea.value.trim();
      reopenReportById(this._id, details);
      navigate('report-thread', { id: this._id });
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(submitBtn);

    wrap.appendChild(title);
    wrap.appendChild(sub);
    wrap.appendChild(label);
    wrap.appendChild(textarea);
    wrap.appendChild(btnRow);

    this.appendChild(wrap);
  }
}
customElements.define('page-report-reopen-escalate', PageReportReopenEscalate);
