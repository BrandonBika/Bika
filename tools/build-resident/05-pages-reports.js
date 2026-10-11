/**
 * @file tools/build-resident/05-pages-reports.js
 * Generates Report Creation and Lifecycle pages.
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

// 1. report-new
write('apps/resident-pwa/src/pages/report-new/report-new.js', `/**
 * @file apps/resident-pwa/src/pages/report-new/report-new.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { submitReport } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';
import { sessionStore } from '../../session.js';
import '../../components/map-pin-picker/map-pin-picker.js';
import '../../components/camera-capture/camera-capture.js';

export class PageReportNew extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const title = createElement('h1', { text: 'Report a Civic Issue' });
    const sub = createElement('p', { text: 'Provide details so your local municipality or service department can resolve it quickly.', attrs: { style: 'color: #6b778c; margin-bottom: 20px;' } });

    const titleInput = createElement('cn-input', { attrs: { label: 'Issue Title', placeholder: 'e.g. Burst water pipe flooding street', required: 'true' } });

    // Category Selector
    const catGroup = createElement('div', { cls: 'cn-input-group' });
    const catLabel = createElement('label', { cls: 'cn-input-label', text: 'Category' });
    const catSelect = createElement('select', { cls: 'cn-input' });
    const cats = [
      { id: 'water_sanitation', name: 'Water & Sanitation' },
      { id: 'electricity', name: 'Electricity & Outages' },
      { id: 'roads_traffic', name: 'Roads, Potholes & Traffic' },
      { id: 'waste_refuse', name: 'Refuse & Illegal Dumping' },
      { id: 'safety_security', name: 'Community Safety' }
    ];
    for (const c of cats) {
      const opt = createElement('option', { attrs: { value: c.id }, text: c.name });
      catSelect.appendChild(opt);
    }
    catGroup.appendChild(catLabel);
    catGroup.appendChild(catSelect);

    const descInput = createElement('cn-input', { attrs: { label: 'Description', type: 'textarea', placeholder: 'Describe what happened, exact landmarks, severity…', required: 'true' } });

    const mapPicker = createElement('cn-map-pin-picker');
    const cameraCapture = createElement('cn-camera-capture');

    const submitBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Submit Report' });
    submitBtn.style.marginTop = '24px';

    submitBtn.onclick = async () => {
      if (!titleInput.value || !descInput.value) {
        showToast('Please fill in title and description', { type: 'error' });
        return;
      }
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
        const isGuest = sessionStore.get().isGuest;
        const coords = mapPicker.coordinates || { lat: -29.8587, lng: 31.0218, address: 'Durban Central' };
        const res = await submitReport({
          title: titleInput.value,
          category: catSelect.value,
          description: descInput.value,
          latitude: coords.lat,
          longitude: coords.lng,
          address: coords.address
        }, isGuest);

        showToast('Report submitted!', { type: 'success' });
        navigate('report-submitted', { ref: res.referenceNumber || 'CN-2026-QUEUED', isGuest });
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Report';
        showToast(err.message || 'Submission failed', { type: 'error' });
      }
    };

    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(titleInput);
    this.appendChild(catGroup);
    this.appendChild(descInput);
    this.appendChild(mapPicker);
    this.appendChild(cameraCapture);
    this.appendChild(submitBtn);
  }
}
customElements.define('page-report-new', PageReportNew);
`);

// 2. guest-report & report-submitted & track-report
write('apps/resident-pwa/src/pages/guest-report/guest-report.js', `/**
 * @file apps/resident-pwa/src/pages/guest-report/guest-report.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { submitReport } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';
import '../../components/captcha-widget/captcha-widget.js';
import '../../components/map-pin-picker/map-pin-picker.js';

export class PageGuestReport extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const title = createElement('h1', { text: 'Guest Civic Report' });
    const sub = createElement('p', { text: 'Report an issue without an account. Save your reference number to check progress.', attrs: { style: 'color: #6b778c; margin-bottom: 20px;' } });

    const contactTypeGroup = createElement('div', { cls: 'cn-input-group' });
    const contactInput = createElement('cn-input', { attrs: { label: 'Your Phone or Email (for SMS/Email Updates)', placeholder: '082 123 4567 or email@domain.co.za', required: 'true' } });

    const titleInput = createElement('cn-input', { attrs: { label: 'Issue Title', placeholder: 'e.g. Broken traffic signal', required: 'true' } });
    const descInput = createElement('cn-input', { attrs: { label: 'Description', type: 'textarea', placeholder: 'Details about the issue…', required: 'true' } });
    const mapPicker = createElement('cn-map-pin-picker');
    const captcha = createElement('cn-captcha-widget');

    const submitBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Submit Guest Report' });

    submitBtn.onclick = async () => {
      if (!contactInput.value || !titleInput.value || !descInput.value) {
        showToast('Please complete required fields', { type: 'error' });
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      const coords = mapPicker.coordinates || { lat: -29.8587, lng: 31.0218, address: 'Durban Central' };
      const res = await submitReport({
        title: titleInput.value,
        category: 'general',
        description: descInput.value,
        latitude: coords.lat,
        longitude: coords.lng,
        address: coords.address,
        guestContact: contactInput.value,
        captchaToken: captcha.token
      }, true);

      navigate('report-submitted', { ref: res.referenceNumber, isGuest: 'true' });
    };

    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(contactInput);
    this.appendChild(titleInput);
    this.appendChild(descInput);
    this.appendChild(mapPicker);
    this.appendChild(captcha);
    this.appendChild(submitBtn);
  }
}
customElements.define('page-guest-report', PageGuestReport);
`);

write('apps/resident-pwa/src/pages/report-submitted/report-submitted.js', `/**
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
    this.style.padding = '32px 20px';
    this.style.textAlign = 'center';

    const icon = createElement('div', { text: '✅', attrs: { style: 'font-size: 3.5rem; margin-bottom: 16px;' } });
    const title = createElement('h1', { text: 'Report Received' });
    const refBox = createElement('div');
    refBox.style.background = '#e3fcef';
    refBox.style.border = '1px solid #abf5d1';
    refBox.style.borderRadius = '8px';
    refBox.style.padding = '16px';
    refBox.style.margin = '20px 0';

    const refLabel = createElement('div', { text: 'Reference Number', attrs: { style: 'font-size: 0.75rem; color: #006644; font-weight: 700;' } });
    const refVal = createElement('div', { text: this._ref || 'CN-2026-0042', attrs: { style: 'font-size: 1.5rem; font-weight: 800; color: #006644; margin-top: 4px;' } });
    refBox.appendChild(refLabel);
    refBox.appendChild(refVal);

    const desc = createElement('p');
    desc.style.color = '#5e6c84';
    desc.style.fontSize = '0.9375rem';
    desc.textContent = this._isGuest
      ? 'Please save your reference number. As a guest, you can track updates using this reference number and your phone/email.'
      : 'Your report has been routed to the relevant municipal department. You can track live updates in "My Reports".';

    const trackBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'View Report Details' });
    trackBtn.style.marginTop = '24px';
    trackBtn.onclick = () => navigate('report-detail', { id: this._ref });

    const homeBtn = createElement('button', { cls: 'cn-btn cn-btn--ghost cn-btn--full', text: 'Return to Home' });
    homeBtn.onclick = () => navigate('home');

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(refBox);
    this.appendChild(desc);
    this.appendChild(trackBtn);
    this.appendChild(homeBtn);
  }
}
customElements.define('page-report-submitted', PageReportSubmitted);
`);

write('apps/resident-pwa/src/pages/track-report/track-report.js', `/**
 * @file apps/resident-pwa/src/pages/track-report/track-report.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { trackGuestReport } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';
import '../../components/captcha-widget/captcha-widget.js';

export class PageTrackReport extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const title = createElement('h1', { text: 'Track a Report' });
    const sub = createElement('p', { text: 'Enter your report reference number and contact info to view status.', attrs: { style: 'color: #6b778c; margin-bottom: 20px;' } });

    const refInput = createElement('cn-input', { attrs: { label: 'Reference Number', placeholder: 'e.g. CN-2026-0042', required: 'true' } });
    const contactInput = createElement('cn-input', { attrs: { label: 'Phone Number or Email', placeholder: 'Used when submitting', required: 'true' } });
    const captcha = createElement('cn-captcha-widget');

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Lookup Status' });

    btn.onclick = async () => {
      if (!refInput.value) {
        showToast('Please enter reference number', { type: 'error' });
        return;
      }
      try {
        btn.disabled = true;
        btn.textContent = 'Searching…';
        const rep = await trackGuestReport(refInput.value.trim(), contactInput.value.trim());
        navigate('report-detail', { id: rep.referenceNumber });
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Lookup Status';
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
`);

// 3. my-reports & report-detail & report-thread & satisfaction & reopen-escalate & duplicate-check
write('apps/resident-pwa/src/pages/my-reports/my-reports.js', `/**
 * @file apps/resident-pwa/src/pages/my-reports/my-reports.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { listMyReports } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';
import '../../components/report-card/report-card.js';
import '../../components/empty-state/empty-state.js';

export class PageMyReports extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '16px';

    const header = createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '16px';

    const title = createElement('h1', { text: 'My Reports', attrs: { style: 'margin: 0; font-size: 1.5rem;' } });
    const newBtn = createElement('button', { cls: 'cn-btn cn-btn--primary', text: '+ New Report' });
    newBtn.onclick = () => navigate('report-new');

    header.appendChild(title);
    header.appendChild(newBtn);
    this.appendChild(header);

    try {
      const res = await listMyReports();
      const list = res.reports || [];
      if (list.length === 0) {
        const empty = createElement('cn-empty-state', {
          attrs: { title: 'No reports yet', message: 'You have not submitted any civic reports yet.' }
        });
        this.appendChild(empty);
      } else {
        for (const rep of list) {
          const card = createElement('cn-report-card');
          card.data = rep;
          this.appendChild(card);
        }
      }
    } catch (e) {
      const err = createElement('cn-error-state', { attrs: { 'error-msg': e.message } });
      this.appendChild(err);
    }
  }
}
customElements.define('page-my-reports', PageMyReports);
`);

write('apps/resident-pwa/src/pages/report-detail/report-detail.js', `/**
 * @file apps/resident-pwa/src/pages/report-detail/report-detail.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getReport, escalateReport, withdrawReport } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';
import '../../components/status-pill/status-pill.js';
import '../../components/confirm-dialog/confirm-dialog.js';

export class PageReportDetail extends BaseElement {
  init(params) {
    this._id = params.id || 'rep-001';
  }

  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    try {
      const rep = await getReport(this._id);
      this._report = rep;
      this.renderReport(rep);
    } catch (e) {
      const err = createElement('cn-error-state', { attrs: { 'error-msg': 'Report not found' } });
      this.appendChild(err);
    }
  }

  renderReport(rep) {
    const top = createElement('div');
    top.style.display = 'flex';
    top.style.justifyContent = 'space-between';
    top.style.alignItems = 'center';

    const ref = createElement('span', { text: rep.referenceNumber, attrs: { style: 'font-weight: 700; color: #6b778c;' } });
    const pill = createElement('cn-status-pill', { attrs: { status: rep.status } });
    top.appendChild(ref);
    top.appendChild(pill);

    const title = createElement('h1', { text: rep.title, attrs: { style: 'margin: 12px 0 8px; font-size: 1.375rem;' } });
    const desc = createElement('p', { text: rep.description, attrs: { style: 'color: #172b4d; line-height: 1.5;' } });
    const addr = createElement('div', { text: \`📍 \${rep.address || 'Address provided'}\`, attrs: { style: 'font-size: 0.875rem; color: #5e6c84; margin-bottom: 20px;' } });

    // Updates Timeline
    const timelineH = createElement('h3', { text: 'Activity & Progress' });
    const timeline = createElement('div');
    timeline.style.borderLeft = '2px solid #dfe1e6';
    timeline.style.paddingLeft = '16px';
    timeline.style.margin = '16px 0 24px';

    for (const update of (rep.updates || [])) {
      const item = createElement('div');
      item.style.marginBottom = '16px';
      const time = createElement('div', { text: \`\${new Date(update.timestamp).toLocaleString()} • \${update.author}\`, attrs: { style: 'font-size: 0.75rem; color: #6b778c;' } });
      const text = createElement('div', { text: update.text, attrs: { style: 'font-size: 0.875rem; margin-top: 2px;' } });
      item.appendChild(time);
      item.appendChild(text);
      timeline.appendChild(item);
    }

    // Action Buttons
    const actions = createElement('div');
    actions.style.display = 'flex';
    actions.style.flexDirection = 'column';
    actions.style.gap = '10px';

    const escalateBtn = createElement('button', { cls: 'cn-btn cn-btn--secondary cn-btn--full', text: '⚡ Manual Escalation' });
    escalateBtn.onclick = () => {
      navigate('report-reopen-escalate', { id: rep.id, type: 'escalate' });
    };

    const threadBtn = createElement('button', { cls: 'cn-btn cn-btn--secondary cn-btn--full', text: '💬 Discussion Thread' });
    threadBtn.onclick = () => navigate('report-thread', { id: rep.id });

    const withdrawBtn = createElement('button', { cls: 'cn-btn cn-btn--ghost cn-btn--full', text: 'Withdraw Report' });
    withdrawBtn.onclick = () => {
      const { CnConfirmDialog } = customElements.get('cn-confirm-dialog') ? { CnConfirmDialog: customElements.get('cn-confirm-dialog') } : {};
      CnConfirmDialog.show({
        title: 'Withdraw Report?',
        message: 'Are you sure you want to withdraw this civic report? This action cannot be undone.',
        confirmText: 'Withdraw',
        danger: true,
        onConfirm: async () => {
          await withdrawReport(rep.id, 'Resident requested withdrawal');
          showToast('Report withdrawn', { type: 'info' });
          navigate('my-reports');
        }
      });
    };

    actions.appendChild(escalateBtn);
    actions.appendChild(threadBtn);
    actions.appendChild(withdrawBtn);

    this.appendChild(top);
    this.appendChild(title);
    this.appendChild(desc);
    this.appendChild(addr);
    this.appendChild(timelineH);
    this.appendChild(timeline);
    this.appendChild(actions);
  }
}
customElements.define('page-report-detail', PageReportDetail);
`);

write('apps/resident-pwa/src/pages/report-thread/report-thread.js', `/**
 * @file apps/resident-pwa/src/pages/report-thread/report-thread.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageReportThread extends BaseElement {
  init(params) {
    this._id = params.id;
  }
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Report Discussion' });
    const p = createElement('p', { text: 'Direct messages with municipal dispatch.', attrs: { style: 'color: #6b778c;' } });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-report-thread', PageReportThread);
`);

write('apps/resident-pwa/src/pages/report-satisfaction/report-satisfaction.js', `/**
 * @file apps/resident-pwa/src/pages/report-satisfaction/report-satisfaction.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { submitSatisfaction } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';

export class PageReportSatisfaction extends BaseElement {
  init(params) {
    this._id = params.id;
  }
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Rate Resolution' });
    const p = createElement('p', { text: 'How satisfied are you with the municipal response?' });
    const comment = createElement('cn-input', { attrs: { label: 'Comments (Optional)', type: 'textarea' } });
    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Submit Feedback' });

    btn.onclick = async () => {
      await submitSatisfaction(this._id, 5, comment.value);
      showToast('Thank you for your feedback!', { type: 'success' });
      navigate('my-reports');
    };

    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(comment);
    this.appendChild(btn);
  }
}
customElements.define('page-report-satisfaction', PageReportSatisfaction);
`);

write('apps/resident-pwa/src/pages/report-reopen-escalate/report-reopen-escalate.js', `/**
 * @file apps/resident-pwa/src/pages/report-reopen-escalate/report-reopen-escalate.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { escalateReport, reopenReport } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';

export class PageReportReopenEscalate extends BaseElement {
  init(params) {
    this._id = params.id;
    this._isEscalate = params.type === 'escalate';
  }
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const title = createElement('h1', { text: this._isEscalate ? 'Escalate Report' : 'Reopen Report' });
    const desc = createElement('p', { text: 'Please explain why this issue requires urgent managerial review.', attrs: { style: 'color: #6b778c;' } });
    const reasonInput = createElement('cn-input', { attrs: { label: 'Reason for Escalation', type: 'textarea', required: 'true' } });
    const btn = createElement('button', { cls: 'cn-btn cn-btn--danger cn-btn--full', text: this._isEscalate ? 'Escalate Now' : 'Reopen Report' });

    btn.onclick = async () => {
      if (!reasonInput.value) {
        showToast('Please provide a reason', { type: 'error' });
        return;
      }
      if (this._isEscalate) {
        await escalateReport(this._id, reasonInput.value);
        showToast('Report escalated to supervisor', { type: 'success' });
      } else {
        await reopenReport(this._id, reasonInput.value);
        showToast('Report reopened', { type: 'success' });
      }
      navigate('report-detail', { id: this._id });
    };

    this.appendChild(title);
    this.appendChild(desc);
    this.appendChild(reasonInput);
    this.appendChild(btn);
  }
}
customElements.define('page-report-reopen-escalate', PageReportReopenEscalate);
`);

write('apps/resident-pwa/src/pages/report-duplicate-check/report-duplicate-check.js', `/**
 * @file apps/resident-pwa/src/pages/report-duplicate-check/report-duplicate-check.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageReportDuplicateCheck extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Similar Reports Nearby' });
    const p = createElement('p', { text: 'We found an active report near your location.' });
    const contBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Submit Anyway' });
    contBtn.onclick = () => navigate('report-new');

    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(contBtn);
  }
}
customElements.define('page-report-duplicate-check', PageReportDuplicateCheck);
`);

console.log('Report pages generated successfully.');
