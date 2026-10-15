/**
 * @file apps/resident-pwa/src/pages/report-satisfaction/report-satisfaction.js
 * Screen I: Close-the-loop standalone page.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getReportById, setReportSatisfaction } from '../../features/reports/reports.store.js';
import { navigate } from '../../router.js';

export class PageReportSatisfaction extends BaseElement {
  init(params) {
    this._id = params?.id || 'CN-2026-04289';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-satisfaction-page');

    const report = getReportById(this._id);
    const orgName = report?.organisation?.name || 'eThekwini Water & Sanitation';

    const wrap = createElement('div', {
      attrs: {
        style: 'padding: 40px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 70vh;'
      }
    });

    const dialog = createElement('div', { cls: 'dialog', attrs: { style: 'max-width: 360px;' } });

    const icon = createElement('div', { cls: ['dialog-icon', 'teal'] });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'var(--teal-deep, #085041)');
    svg.setAttribute('stroke-width', '2.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M20 6 9 17l-5-5');
    svg.appendChild(p);
    icon.appendChild(svg);

    const title = createElement('div', { cls: 'dialog-title', text: 'Marked as resolved' });
    const body = createElement('div', {
      cls: 'dialog-body',
      text: `${orgName} says this has been fixed. Was it resolved to your satisfaction?`
    });

    const btnRow = createElement('div', { cls: 'btn-row' });
    const noBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button' },
      text: 'No, still an issue'
    });
    noBtn.onclick = () => {
      navigate('report-reopen-escalate', { id: this._id });
    };

    const yesBtn = createElement('button', {
      cls: ['btn-flat', 'primary'],
      attrs: { type: 'button' },
      text: 'Yes, all good'
    });
    yesBtn.onclick = () => {
      setReportSatisfaction(this._id, true);
      navigate('my-reports');
    };

    btnRow.appendChild(noBtn);
    btnRow.appendChild(yesBtn);

    dialog.appendChild(icon);
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(btnRow);

    wrap.appendChild(dialog);
    this.appendChild(wrap);
  }
}
customElements.define('page-report-satisfaction', PageReportSatisfaction);
