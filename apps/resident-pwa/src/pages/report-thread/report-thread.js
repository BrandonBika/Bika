/**
 * @file apps/resident-pwa/src/pages/report-thread/report-thread.js
 * Screen F: Conversation thread.
 * Chat header, day labels, me/org bubbles, input bar with optimistic sending,
 * and mark-as-read on open.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { reportsStore, getReportById, addReportMessage, markReportAsRead } from '../../features/reports/reports.store.js';
import { goBack } from '../../router.js';

function createBackArrowSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'm15 18-6-6 6-6');
  svg.appendChild(p);
  return svg;
}

function createBuildingSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M3 21h18M5 21V7l7-4 7 4v14');
  svg.appendChild(p);
  return svg;
}

function createSendSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'm22 2-7 20-4-9-9-4Z');
  svg.appendChild(p);
  return svg;
}

export class PageReportThread extends BaseElement {
  init(params) {
    this._reportId = params?.id || 'CN-2026-04452';
  }

  connectedCallback() {
    this._unsubscribe = reportsStore.subscribe(() => {
      this._renderMessages();
    });

    // Mark messages read on open
    markReportAsRead(this._reportId);

    this._render();
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    super.disconnectedCallback();
  }

  _render() {
    clearChildren(this);
    this.classList.add('cn-report-thread-page');

    const report = getReportById(this._reportId);
    if (!report) {
      const err = createElement('div', {
        cls: 'th-page',
        text: 'Report conversation not found.'
      });
      this.appendChild(err);
      return;
    }

    const container = createElement('div', { cls: 'th-page' });

    // 1. CHAT HEADER
    const chatHeader = createElement('div', { cls: 'm-chat-header' });

    const backBtn = createElement('button', {
      cls: 'ch-back',
      attrs: { type: 'button', 'aria-label': 'Back to report detail', id: 'thread-back-btn' }
    });
    backBtn.appendChild(createBackArrowSvg());
    backBtn.onclick = () => goBack('report-detail', { id: report.id });

    const titlesCol = createElement('div');
    const orgName = report.organisation?.name || 'eThekwini Municipality';
    const orgTitle = createElement('div', { cls: 'ch-title', text: orgName });
    const subText = `${report.referenceNumber} · ${report.title}`;
    const subTitle = createElement('div', { cls: 'ch-sub', text: subText });
    titlesCol.appendChild(orgTitle);
    titlesCol.appendChild(subTitle);

    chatHeader.appendChild(backBtn);
    chatHeader.appendChild(titlesCol);
    container.appendChild(chatHeader);

    // 2. MESSAGES CONTAINER
    this._messagesList = createElement('div', {
      cls: 'th-messages-container',
      attrs: { id: 'thread-messages-list' }
    });
    container.appendChild(this._messagesList);

    // 3. INPUT BAR (pinned above bottom nav)
    const inputBarWrap = createElement('div', { cls: 'm-chat-input-bar' });
    const inputBar = createElement('div', { cls: 'm-chat-input' });

    this._msgInput = createElement('input', {
      attrs: {
        type: 'text',
        placeholder: 'Write a message…',
        'aria-label': 'Write a message to the department',
        id: 'thread-message-input'
      }
    });

    const sendBtn = createElement('button', {
      cls: 'ci-send',
      attrs: { type: 'button', 'aria-label': 'Send message', id: 'thread-send-btn' }
    });
    sendBtn.appendChild(createSendSvg());

    const handleSend = () => {
      const text = this._msgInput.value.trim();
      if (!text) return;
      this._msgInput.value = '';
      addReportMessage(report.id, text, 'resident');
      this._scrollToBottom();
    };

    sendBtn.onclick = handleSend;
    this._msgInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    };

    inputBar.appendChild(this._msgInput);
    inputBar.appendChild(sendBtn);
    inputBarWrap.appendChild(inputBar);
    container.appendChild(inputBarWrap);

    this.appendChild(container);
    this._renderMessages();
  }

  _renderMessages() {
    if (!this._messagesList) return;
    clearChildren(this._messagesList);

    const report = getReportById(this._reportId);
    if (!report) return;

    const messages = report.messages || [];

    // Group messages by day
    let currentDay = '';

    for (const msg of messages) {
      const day = msg.day || 'Today';
      if (day !== currentDay) {
        currentDay = day;
        const dayLabel = createElement('div', { cls: 'm-chat-daylabel', text: day });
        this._messagesList.appendChild(dayLabel);
      }

      const isMe = msg.sender === 'resident';
      const row = createElement('div', {
        cls: ['m-bubble-row', isMe ? 'me' : 'org']
      });

      if (!isMe) {
        const avatar = createElement('div', { cls: 'org-avatar' });
        avatar.appendChild(createBuildingSvg());
        row.appendChild(avatar);
      }

      const wrap = createElement('div', { cls: 'm-bubble-wrap' });
      const bubble = createElement('div', { cls: 'm-bubble' });

      if (!isMe && (msg.orgName || report.organisation?.name)) {
        const orgLabel = createElement('span', {
          cls: 'b-org-name',
          text: msg.orgName || report.organisation?.name
        });
        bubble.appendChild(orgLabel);
      }

      const bubbleText = createElement('span', { text: msg.text });
      bubble.appendChild(bubbleText);

      const time = createElement('div', { cls: 'm-bubble-time', text: msg.time || '' });

      wrap.appendChild(bubble);
      wrap.appendChild(time);
      row.appendChild(wrap);

      this._messagesList.appendChild(row);
    }

    this._scrollToBottom();
  }

  _scrollToBottom() {
    setTimeout(() => {
      if (this._messagesList) {
        this._messagesList.scrollTop = this._messagesList.scrollHeight;
      }
    }, 50);
  }
}

customElements.define('page-report-thread', PageReportThread);
