/**
 * @file apps/resident-pwa/src/pages/report-detail/report-detail.js
 * Screen E: Report detail
 * Screen G: "Add information" bottom sheet
 * Screen H: "Withdraw" confirm dialog
 * Screen I: Close-the-loop dialog ("Marked as resolved")
 * Screen J: Dispute / "Reopen report" bottom sheet
 * Escalate confirmation dialog (with TODO flag for future design).
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import {
  reportsStore,
  getReportById,
  escalateReportById,
  withdrawReportById,
  setReportSatisfaction,
  reopenReportById,
  addInformationToReport
} from '../../features/reports/reports.store.js';
import { createStatusPill } from '../../components/status-pill/status-pill.js';
import { createErrorState } from '../../components/error-state/error-state.js';
import { navigate } from '../../router.js';
import '../../components/back-button/back-button.js';

function createBuildingSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M9 13h1M14 9h1M14 13h1');
  svg.appendChild(p1);
  return svg;
}

function createChevronSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'm9 18 6-6-6-6');
  svg.appendChild(p);
  return svg;
}

function createWarnSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'M12 9v4M12 17h.01');
  const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p2.setAttribute('d', 'M10.3 3.86 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z');
  svg.appendChild(p1);
  svg.appendChild(p2);
  return svg;
}

function createCheckSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M20 6 9 17l-5-5');
  svg.appendChild(p);
  return svg;
}

function createCameraSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z');
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '12');
  c.setAttribute('cy', '13');
  c.setAttribute('r', '4');
  svg.appendChild(p1);
  svg.appendChild(c);
  return svg;
}

function createVideoSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'm22 7-6 5 6 5V7Z');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '2');
  rect.setAttribute('y', '5');
  rect.setAttribute('width', '14');
  rect.setAttribute('height', '14');
  rect.setAttribute('rx', '2');
  svg.appendChild(p);
  svg.appendChild(rect);
  return svg;
}

function createAudioSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z');
  const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p2.setAttribute('d', 'M19 10v2a7 7 0 0 1-14 0v-2M12 19v4');
  svg.appendChild(p1);
  svg.appendChild(p2);
  return svg;
}

export class PageReportDetail extends BaseElement {
  init(params) {
    this._reportId = params?.id || 'CN-2026-04452';
  }

  connectedCallback() {
    this._activeOverlay = null;
    this._unsubscribe = reportsStore.subscribe(() => {
      this._render();
    });
    this._render();

    // Check if auto Close-the-loop dialog should appear
    const report = getReportById(this._reportId);
    if (report && report.status === 'resolved' && report.satisfaction === null) {
      setTimeout(() => this._showCloseTheLoopDialog(report), 180);
    }
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    this._closeOverlay();
    super.disconnectedCallback();
  }

  _render() {
    clearChildren(this);
    this.classList.add('cn-report-detail-page');
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'my-reports' } }));

    const report = getReportById(this._reportId);
    if (!report) {
      const err = createErrorState({
        title: "Report not found",
        message: "We couldn't locate this report. It may have been removed or the link is expired.",
        onRetry: () => navigate('my-reports')
      });
      this.appendChild(err);
      return;
    }

    const container = createElement('div', { cls: 'rd-page' });

    // 1. HEADER (flex space-between align flex-start)
    const header = createElement('div', { cls: 'detail-head' });
    const headerLeft = createElement('div');
    const refEl = createElement('div', { cls: 'detail-ref', text: report.referenceNumber });
    const catLocText = [report.title, report.location].filter(Boolean).join(' · ');
    const catLocEl = createElement('div', { cls: 'detail-cat', text: catLocText });
    headerLeft.appendChild(refEl);
    headerLeft.appendChild(catLocEl);

    const pill = createStatusPill(report.status);
    header.appendChild(headerLeft);
    header.appendChild(pill);
    container.appendChild(header);

    // 2. DESCRIPTION CARD
    const descCard = createElement('div', { cls: 'detail-desc' });
    if (report.originalTranscript || report.englishTranslation) {
      if (report.detectedLanguageName) {
        descCard.appendChild(createElement('strong', {
          text: `Detected language: ${report.detectedLanguageName}`
        }));
      }
      if (report.originalTranscript) {
        descCard.append(
          createElement('div', { text: 'Original transcript' }),
          createElement('p', { text: report.originalTranscript })
        );
      }
      if (report.englishTranslation) {
        descCard.append(
          createElement('div', { text: 'English translation' }),
          createElement('p', { text: report.englishTranslation })
        );
      }
    } else {
      descCard.textContent = report.description || 'No description provided.';
    }
    container.appendChild(descCard);

    // 3. SECTION LABEL "STATUS"
    const statusLabel = createElement('div', {
      cls: 'm-sectiontitle',
      text: 'STATUS'
    });
    container.appendChild(statusLabel);

    // 4. STATUS TIMELINE ("route line")
    const timelineEl = createElement('div', { cls: 'route-line' });
    const steps = report.timeline || [
      { step: 'submitted', label: 'Submitted', at: report.displayTime, status: 'done' },
      { step: 'received', label: 'Received', at: '', status: 'done' },
      { step: 'under_review', label: 'Under review', at: '', status: 'current' },
      { step: 'in_progress', label: 'In progress', at: '', status: 'upcoming' },
      { step: 'resolved', label: 'Resolved', at: '', status: 'upcoming' }
    ];

    for (const step of steps) {
      const stepEl = createElement('div', {
        cls: [
          'route-step',
          step.status,
          step.step === 'escalated' ? 'escalated-step' : ''
        ]
      });

      const labelEl = createElement('div', { cls: 'r-label', text: step.label });
      stepEl.appendChild(labelEl);

      if (step.at) {
        const metaEl = createElement('div', { cls: 'r-meta', text: step.at });
        stepEl.appendChild(metaEl);
      }

      timelineEl.appendChild(stepEl);
    }
    container.appendChild(timelineEl);

    // 5. SECTION LABEL "CONVERSATION"
    const convoLabel = createElement('div', {
      cls: 'm-sectiontitle',
      text: 'CONVERSATION'
    });
    container.appendChild(convoLabel);

    // 6. CONVERSATION PREVIEW (tappable row)
    const convoPreview = createElement('div', {
      cls: 'm-convo-preview',
      attrs: { role: 'button', tabindex: '0', 'aria-label': 'Open conversation thread' }
    });

    const avatar = createElement('div', { cls: 'cv-avatar' });
    avatar.appendChild(createBuildingSvg());

    const body = createElement('div', { cls: 'cv-body' });
    const topRow = createElement('div', { cls: 'cv-top' });

    const orgName = report.organisation?.name || 'Municipal Department';
    const orgEl = createElement('span', { cls: 'cv-org', text: orgName });

    const messages = report.messages || [];
    const lastMsg = messages[messages.length - 1];
    const lastTime = lastMsg ? lastMsg.time : report.displayTime;
    const timeEl = createElement('span', { cls: 'cv-time', text: lastTime });

    topRow.appendChild(orgEl);
    topRow.appendChild(timeEl);

    const snippetText = lastMsg ? lastMsg.text : 'Thanks for the details — a crew has been assigned.';
    const snippetEl = createElement('div', { cls: 'cv-snippet', text: snippetText });

    body.appendChild(topRow);
    body.appendChild(snippetEl);

    convoPreview.appendChild(avatar);
    convoPreview.appendChild(body);

    if (report.unreadCount > 0) {
      const unreadDot = createElement('div', {
        cls: 'cv-unread',
        attrs: { 'aria-label': 'Unread message' }
      });
      convoPreview.appendChild(unreadDot);
    }

    const chevWrap = createElement('div', { cls: 'cv-chev' });
    chevWrap.appendChild(createChevronSvg());
    convoPreview.appendChild(chevWrap);

    const openThread = () => navigate('report-thread', { id: report.id });
    convoPreview.onclick = openThread;
    convoPreview.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openThread();
      }
    };
    container.appendChild(convoPreview);

    // 7. HELPER TEXT
    const helper = createElement('div', {
      cls: 'rd-helper-text',
      text: 'Escalates automatically if the SLA for this category is breached, or tap Escalate to request it manually.'
    });
    container.appendChild(helper);

    // 8. ACTION ROW & VISIBILITY RULES
    // Rules from spec:
    // - Resolved: hide all three; show close-the-loop result instead (a "Dispute this" link opens Screen J).
    // - Withdrawn: hide all three.
    // - Escalated: disable Escalate (already escalated).
    if (report.status === 'resolved') {
      const resolvedBox = createElement('div', { cls: 'rd-resolved-result' });
      const resTitle = createElement('div', {
        cls: 'rd-resolved-title',
        text: 'Issue marked as resolved'
      });
      const resSub = createElement('div', {
        cls: 'rd-resolved-sub',
        text: report.satisfaction === true
          ? `You confirmed this issue was resolved to your satisfaction by ${orgName}.`
          : `${orgName} marked this as resolved.`
      });
      const disputeBtn = createElement('button', {
        cls: 'rd-dispute-link',
        attrs: { type: 'button' },
        text: 'Still an issue? Dispute and reopen'
      });
      disputeBtn.onclick = () => this._showReopenSheet(report);

      resolvedBox.appendChild(resTitle);
      resolvedBox.appendChild(resSub);
      resolvedBox.appendChild(disputeBtn);
      container.appendChild(resolvedBox);
    } else if (report.status !== 'withdrawn') {
      const actionRow = createElement('div', { cls: 'icon-btn-row' });

      // Button 1: Add information
      const addInfoBtn = createElement('button', {
        cls: 'icon-btn',
        attrs: { type: 'button', id: 'rd-btn-add-info' },
        text: 'Add information'
      });
      addInfoBtn.onclick = () => this._showAddInformationSheet(report);

      // Button 2: Escalate
      const isAlreadyEscalated = report.status === 'escalated';
      const escalateBtn = createElement('button', {
        cls: 'icon-btn',
        attrs: {
          type: 'button',
          id: 'rd-btn-escalate',
          ...(isAlreadyEscalated ? { disabled: 'true' } : {})
        },
        text: isAlreadyEscalated ? 'Escalated' : 'Escalate'
      });
      if (!isAlreadyEscalated) {
        escalateBtn.onclick = () => this._showEscalateDialog(report);
      }

      // Button 3: Withdraw
      const withdrawBtn = createElement('button', {
        cls: ['icon-btn', 'danger'],
        attrs: { type: 'button', id: 'rd-btn-withdraw' },
        text: 'Withdraw'
      });
      withdrawBtn.onclick = () => this._showWithdrawDialog(report);

      actionRow.appendChild(addInfoBtn);
      actionRow.appendChild(escalateBtn);
      actionRow.appendChild(withdrawBtn);
      container.appendChild(actionRow);
    }

    this.appendChild(container);
  }

  /* ---------------------------------------------------------------
   * SCREEN G — "ADD INFORMATION" BOTTOM SHEET
   * --------------------------------------------------------------- */
  _showAddInformationSheet(report) {
    this._closeOverlay();

    const backdrop = createElement('div', { cls: 'modal-backdrop' });
    const sheet = createElement('div', {
      cls: 'sheet',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Add information' }
    });

    const handle = createElement('div', { cls: 'sheet-handle' });
    const title = createElement('div', { cls: 'sheet-title', text: 'Add information' });
    const orgName = report.organisation?.name || 'the department';
    const sub = createElement('div', {
      cls: 'sheet-sub',
      text: `This will be added to ${report.referenceNumber} and sent to ${orgName}.`
    });

    const detailsLabel = createElement('div', { cls: 'm-field-label', text: 'DETAILS' });
    const textarea = createElement('textarea', {
      cls: 'm-textfield',
      attrs: {
        placeholder: 'The pothole has grown wider since I first reported it — now closer to 60cm…',
        id: 'sheet-details-input'
      }
    });

    const evidenceLabel = createElement('div', { cls: 'm-field-label', text: 'ADD EVIDENCE (OPTIONAL)' });
    const evidenceRow = createElement('div', { cls: 'm-evidence-row' });

    const evidenceItems = ['photo', 'video', 'audio'];
    const activeEvidence = new Set();

    const createEvidenceBox = (type, svgFn, label) => {
      const box = createElement('button', {
        cls: 'm-evidence-box',
        attrs: { type: 'button', 'aria-label': `Attach ${label}` }
      });
      box.appendChild(svgFn());
      const lbl = createElement('span', { cls: 'm-evidence-label', text: label });
      box.appendChild(lbl);

      box.onclick = () => {
        if (activeEvidence.has(type)) {
          activeEvidence.delete(type);
          box.classList.remove('active');
        } else {
          activeEvidence.add(type);
          box.classList.add('active');
        }
        updateSubmitState();
      };
      return box;
    };

    evidenceRow.appendChild(createEvidenceBox('photo', createCameraSvg, 'Camera'));
    evidenceRow.appendChild(createEvidenceBox('video', createVideoSvg, 'Video'));
    evidenceRow.appendChild(createEvidenceBox('audio', createAudioSvg, 'Audio'));

    const btnRow = createElement('div', { cls: 'btn-row' });
    const cancelBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button' },
      text: 'Cancel'
    });
    cancelBtn.onclick = () => this._closeOverlay();

    const submitBtn = createElement('button', {
      cls: ['btn-flat', 'primary'],
      attrs: { type: 'button', disabled: 'true', id: 'sheet-submit-btn' },
      text: 'Submit'
    });

    const updateSubmitState = () => {
      const hasText = Boolean(textarea.value.trim());
      const hasEvidence = activeEvidence.size > 0;
      if (hasText || hasEvidence) {
        submitBtn.removeAttribute('disabled');
      } else {
        submitBtn.setAttribute('disabled', 'true');
      }
    };

    textarea.oninput = updateSubmitState;

    submitBtn.onclick = () => {
      const details = textarea.value.trim();
      const evidence = Array.from(activeEvidence);
      addInformationToReport(report.id, details, evidence);
      this._closeOverlay();
      navigate('report-thread', { id: report.id });
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(submitBtn);

    sheet.appendChild(handle);
    sheet.appendChild(title);
    sheet.appendChild(sub);
    sheet.appendChild(detailsLabel);
    sheet.appendChild(textarea);
    sheet.appendChild(evidenceLabel);
    sheet.appendChild(evidenceRow);
    sheet.appendChild(btnRow);

    backdrop.onclick = (e) => {
      if (e.target === backdrop) this._closeOverlay();
    };

    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
    this._activeOverlay = backdrop;
  }

  /* ---------------------------------------------------------------
   * SCREEN H — WITHDRAW CONFIRM DIALOG
   * --------------------------------------------------------------- */
  _showWithdrawDialog(report) {
    this._closeOverlay();

    const backdrop = createElement('div', { cls: ['modal-backdrop', 'center'] });
    const dialog = createElement('div', {
      cls: 'dialog',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Withdraw report confirmation' }
    });

    const icon = createElement('div', { cls: ['dialog-icon', 'warn'] });
    icon.appendChild(createWarnSvg());

    const title = createElement('div', { cls: 'dialog-title', text: 'Withdraw this report?' });
    const orgName = report.organisation?.name || 'The municipal department';
    const body = createElement('div', {
      cls: 'dialog-body',
      text: `${orgName} will stop work on ${report.referenceNumber}. This can't be undone, but you can submit a new report anytime.`
    });

    const reasonLabel = createElement('div', { cls: 'm-field-label', text: 'REASON (OPTIONAL)' });
    const reasonInput = createElement('input', {
      cls: 'dialog-input',
      attrs: {
        type: 'text',
        placeholder: 'Already fixed by the time a crew arrived…',
        id: 'withdraw-reason-input'
      }
    });

    const btnRow = createElement('div', { cls: 'btn-row' });
    const cancelBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button' },
      text: 'Cancel'
    });
    cancelBtn.onclick = () => this._closeOverlay();

    const confirmBtn = createElement('button', {
      cls: ['btn-flat', 'danger'],
      attrs: { type: 'button', id: 'confirm-withdraw-btn' },
      text: 'Withdraw report'
    });

    confirmBtn.onclick = () => {
      const reason = reasonInput.value.trim() || 'Resident requested withdrawal';
      withdrawReportById(report.id, reason);
      this._closeOverlay();
      navigate('my-reports', {}, { replace: true });
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);

    dialog.appendChild(icon);
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(reasonLabel);
    dialog.appendChild(reasonInput);
    dialog.appendChild(btnRow);

    backdrop.onclick = (e) => {
      if (e.target === backdrop) this._closeOverlay();
    };

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    this._activeOverlay = backdrop;
  }

  /* ---------------------------------------------------------------
   * SCREEN I — CLOSE-THE-LOOP DIALOG ("Marked as resolved")
   * --------------------------------------------------------------- */
  _showCloseTheLoopDialog(report) {
    this._closeOverlay();

    const backdrop = createElement('div', { cls: ['modal-backdrop', 'center'] });
    const dialog = createElement('div', {
      cls: 'dialog',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Marked as resolved satisfaction' }
    });

    const icon = createElement('div', { cls: ['dialog-icon', 'teal'] });
    icon.appendChild(createCheckSvg());

    const title = createElement('div', { cls: 'dialog-title', text: 'Marked as resolved' });
    const orgName = report.organisation?.name || 'eThekwini Water & Sanitation';
    const body = createElement('div', {
      cls: 'dialog-body',
      text: `${orgName} says this has been fixed. Was it resolved to your satisfaction?`
    });

    const btnRow = createElement('div', { cls: 'btn-row' });
    const noBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button', id: 'loop-no-btn' },
      text: 'No, still an issue'
    });
    noBtn.onclick = () => {
      this._closeOverlay();
      this._showReopenSheet(report);
    };

    const yesBtn = createElement('button', {
      cls: ['btn-flat', 'primary'],
      attrs: { type: 'button', id: 'loop-yes-btn' },
      text: 'Yes, all good'
    });
    yesBtn.onclick = () => {
      setReportSatisfaction(report.id, true);
      this._closeOverlay();
      navigate('my-reports', {}, { replace: true });
    };

    btnRow.appendChild(noBtn);
    btnRow.appendChild(yesBtn);

    dialog.appendChild(icon);
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(btnRow);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    this._activeOverlay = backdrop;
  }

  /* ---------------------------------------------------------------
   * SCREEN J — DISPUTE / REOPEN SHEET
   * --------------------------------------------------------------- */
  _showReopenSheet(report) {
    this._closeOverlay();

    const backdrop = createElement('div', { cls: 'modal-backdrop' });
    const sheet = createElement('div', {
      cls: 'sheet',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Dispute and reopen report' }
    });

    const handle = createElement('div', { cls: 'sheet-handle' });
    const title = createElement('div', { cls: 'sheet-title', text: "Tell us what's still wrong" });
    const orgName = report.organisation?.name || 'the department';
    const sub = createElement('div', {
      cls: 'sheet-sub',
      text: `This reopens ${report.referenceNumber} and escalates it to ${orgName}'s supervisor queue.`
    });

    const detailsLabel = createElement('div', { cls: 'm-field-label', text: 'DETAILS' });
    const textarea = createElement('textarea', {
      cls: 'm-textfield',
      attrs: {
        placeholder: 'The drain is clear but water is still pooling after rain…',
        id: 'reopen-details-input'
      }
    });

    const btnRow = createElement('div', { cls: 'btn-row' });
    const cancelBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button' },
      text: 'Cancel'
    });
    cancelBtn.onclick = () => this._closeOverlay();

    const submitBtn = createElement('button', {
      cls: ['btn-flat', 'primary'],
      attrs: { type: 'button', disabled: 'true', id: 'reopen-submit-btn' },
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
      reopenReportById(report.id, details);
      this._closeOverlay();
      navigate('report-thread', { id: report.id });
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(submitBtn);

    sheet.appendChild(handle);
    sheet.appendChild(title);
    sheet.appendChild(sub);
    sheet.appendChild(detailsLabel);
    sheet.appendChild(textarea);
    sheet.appendChild(btnRow);

    backdrop.onclick = (e) => {
      if (e.target === backdrop) this._closeOverlay();
    };

    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
    this._activeOverlay = backdrop;
  }

  /* ---------------------------------------------------------------
   * ESCALATE CONFIRMATION DIALOG (PLACEHOLDER FOR DESIGN)
   * --------------------------------------------------------------- */
  _showEscalateDialog(report) {
    // TODO: Design to provide dedicated Escalate screen.
    // Temporary confirmation modal per prompt spec:
    // Tap -> confirmation dialog (same component as Withdraw but with primary teal action)
    // with title "Escalate this report?" and body "We'll ask the supervisor queue at <Org> to look at it now."
    this._closeOverlay();

    const backdrop = createElement('div', { cls: ['modal-backdrop', 'center'] });
    const dialog = createElement('div', {
      cls: 'dialog',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Escalate report confirmation' }
    });

    const icon = createElement('div', { cls: ['dialog-icon', 'teal'] });
    icon.appendChild(createCheckSvg());

    const title = createElement('div', { cls: 'dialog-title', text: 'Escalate this report?' });
    const orgName = report.organisation?.name || 'the department';
    const body = createElement('div', {
      cls: 'dialog-body',
      text: `We'll ask the supervisor queue at ${orgName} to look at it now.`
    });

    const btnRow = createElement('div', { cls: 'btn-row' });
    const cancelBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button' },
      text: 'Cancel'
    });
    cancelBtn.onclick = () => this._closeOverlay();

    const confirmBtn = createElement('button', {
      cls: ['btn-flat', 'primary'],
      attrs: { type: 'button', id: 'confirm-escalate-btn' },
      text: 'Escalate now'
    });

    confirmBtn.onclick = () => {
      escalateReportById(report.id, 'Resident requested manual escalation');
      this._closeOverlay();
      this._render();
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);

    dialog.appendChild(icon);
    dialog.appendChild(title);
    dialog.appendChild(body);
    dialog.appendChild(btnRow);

    backdrop.onclick = (e) => {
      if (e.target === backdrop) this._closeOverlay();
    };

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    this._activeOverlay = backdrop;
  }

  _closeOverlay() {
    if (this._activeOverlay && this._activeOverlay.parentNode) {
      this._activeOverlay.parentNode.removeChild(this._activeOverlay);
    }
    this._activeOverlay = null;
  }
}

customElements.define('page-report-detail', PageReportDetail);