/**
 * @file apps/resident-pwa/src/pages/beacon-chat/beacon-chat.js
 * Screen C: Chat with a circle member.
 * Persistent messaging, header live location status link,
 * live-location system cards, bubbles, and quick share location action.
 */

import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import {
  getMemberById,
  getChatMessages,
  refreshBeaconCircle,
  refreshChatMessages,
  sendChatMessage,
  subscribeBeacon,
  subscribeToBeaconChat
} from '../../features/beacon/beacon.client.js';
import { navigate } from '../../router.js';

function activateOnKeyboard(element, action) {
  element.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
}

export class PageBeaconChat extends BaseElement {
  init(params) {
    this._params = params || {};
    this._memberId = this._params.memberId || '';
  }

  connectedCallback() {
    clearChildren(this);
    this._chatBody = null;
    this._textInput = null;
    this.classList.add('cn-beacon-chat-page');
    this._opening = true;
    this._messages = getChatMessages(this._memberId);

    this._unsubscribe = subscribeBeacon(() => {
      if (this.isConnected) {
        this._messages = getChatMessages(this._memberId);
        this.renderMessages();
      }
    });
    this._onOnline = () => {
      this.reloadConversation().catch((error) => {
        console.error('Could not refresh Beacon chat after reconnect:', error);
      });
    };
    window.addEventListener('online', this._onOnline);

    this.openConversation().catch((error) => {
      console.error('Could not open Beacon chat:', error);
      this._opening = false;
      showToast(error.message || 'Could not load this conversation.', { type: 'error' });
      if (this.isConnected) this.render();
    });
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._unsubscribeChat) this._unsubscribeChat();
    window.removeEventListener('online', this._onOnline);
    super.disconnectedCallback();
  }

  async openConversation() {
    await refreshBeaconCircle();
    if (!this.isConnected) return;
    const member = getMemberById(this._memberId);
    if (!member) {
      this._opening = false;
      navigate('beacon-add-to-circle');
      return;
    }

    const subscription = await subscribeToBeaconChat(this._memberId, (error) => {
      console.error('Beacon chat Realtime error:', error);
      this._opening = false;
      if (this.isConnected) {
        showToast(error.message || 'Could not open this conversation.', { type: 'error' });
        this.render();
      }
    });
    if (!subscription) return;
    this._unsubscribeChat = () => subscription.unsubscribe();
    await subscription.ready;
    if (!this.isConnected) return;
    await refreshChatMessages(this._memberId);
    this._messages = getChatMessages(this._memberId);
    await refreshBeaconCircle();
    this._opening = false;
    if (this.isConnected) this.render();
  }

  async reloadConversation() {
    if (!this._memberId || !this.isConnected) return;
    await refreshBeaconCircle();
    if (!getMemberById(this._memberId)) return;
    this._messages = await refreshChatMessages(this._memberId);
  }

  render() {
    if (this._opening) {
      clearChildren(this);
      return;
    }
    const member = getMemberById(this._memberId);
    if (!member) {
      navigate('beacon-add-to-circle');
      return;
    }

    if (this._chatBody) {
      this._member = member;
      this.renderMessages();
      return;
    }

    clearChildren(this);

    // 1. Header
    const header = createElement('div', { cls: 'chat-header' });
    const backBtn = createElement('button', {
      cls: 'chat-back-btn',
      attrs: { type: 'button', 'aria-label': 'Back to Beacon', id: 'chat-back-btn' }
    });
    backBtn.appendChild(BeaconIcons.back(13));
    backBtn.onclick = () => navigate('beacon-home');

    const headerText = createElement('div', { cls: 'chat-header-text' });
    const name = createElement('div', { cls: 'chat-title', text: member.name });
    headerText.appendChild(name);

    if (member.isSharing) {
      const liveStatus = createElement('div', {
        cls: 'chat-live-status',
        attrs: {
          role: 'button',
          tabindex: '0',
          title: 'View live sharing session'
        },
        text: `● ${member.statusText || 'Sharing live location'}`
      });
      const openSession = () => navigate('beacon-share-session');
      liveStatus.onclick = openSession;
      activateOnKeyboard(liveStatus, openSession);
      headerText.appendChild(liveStatus);
    }

    header.append(backBtn, headerText);
    this.appendChild(header);

    // 2. Chat Conversation Body
    const body = createElement('div', {
      cls: 'chat-body',
      attrs: { id: 'chat-messages-container', role: 'log', 'aria-live': 'polite' }
    });
    this._chatBody = body;
    this._member = member;
    this.renderMessages();
    this.appendChild(body);

    // 3. Input bar
    const inputBar = createElement('div', { cls: 'm-chat-input' });

    // Pin shortcut button: opens share mode with this member preselected
    const sharePinBtn = createElement('button', {
      cls: 'chat-share-pin-btn',
      attrs: {
        type: 'button',
        'aria-label': 'Prototype: share live location; it is not delivered to others',
        title: 'Prototype: live location is not delivered to others'
      }
    });
    sharePinBtn.appendChild(BeaconIcons.pin(13, 'var(--beacon-deep, #0E5961)'));
    sharePinBtn.onclick = () => {
      navigate('beacon-start-confirm', { memberId: member.id, mode: 'live' });
    };

    const textInput = createElement('input', {
      attrs: {
        type: 'text',
        placeholder: 'Write a message…',
        id: 'chat-text-input',
        'aria-label': 'Write a message',
        value: this._draftText || ''
      }
    });
    this._textInput = textInput;
    textInput.oninput = () => {
      this._draftText = textInput.value;
    };

    const sendBtn = createElement('button', {
      cls: 'chat-send-btn',
      attrs: {
        type: 'button',
        'aria-label': 'Send message',
        id: 'chat-send-btn'
      }
    });
    sendBtn.appendChild(BeaconIcons.send(14, '#FFFFFF'));

    const doSend = async () => {
      const val = textInput.value.trim();
      if (!val) return;
      sendBtn.disabled = true;
      try {
        await sendChatMessage(this._memberId, val);
        this._draftText = '';
        this._messages = getChatMessages(this._memberId);
        textInput.value = '';
        this._textInput?.focus?.();
        if (this.isConnected) this.renderMessages();
        sendBtn.disabled = false;
      } catch (error) {
        console.error('Could not send Beacon message:', error);
        showToast(error.message || 'Could not send message.', { type: 'error' });
        sendBtn.disabled = false;
      }
    };

    sendBtn.onclick = doSend;
    textInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSend();
      }
    };

    inputBar.append(sharePinBtn, textInput, sendBtn);
    this.appendChild(inputBar);
  }

  renderMessages() {
    const body = this._chatBody;
    if (!body) return;
    clearChildren(body);

    const dayLabel = createElement('div', { cls: 'chat-daylabel', text: 'Today' });
    body.appendChild(dayLabel);
    for (const msg of this._messages || getChatMessages(this._memberId)) {
      if (msg.sender === 'system') {
        const isAlert = msg.kind === 'off_path';
        const card = createElement('div', {
          cls: ['bc-share-card', isAlert ? 'alert' : ''],
          attrs: { role: 'button', tabindex: '0' }
        });
        const label = createElement('div', { cls: 'bc-share-label' });
        label.appendChild(isAlert ? BeaconIcons.warning(11) : BeaconIcons.pin(11, 'var(--beacon-deep, #0E5961)'));
        label.appendChild(createElement('span', { text: msg.label || 'Live location started' }));
        const sub = createElement('div', { cls: 'bc-share-sub', text: msg.sub || '' });
        card.append(label, sub);
        const openSession = () => navigate('beacon-share-session');
        card.onclick = openSession;
        activateOnKeyboard(card, openSession);
        body.appendChild(card);
      } else if (msg.sender === 'them') {
        const row = createElement('div', { cls: ['m-bubble-row', 'theirs'] });
        const avatar = createElement('div', { cls: 'chat-avatar', text: this._member.initial });
        const wrap = createElement('div', { cls: 'm-bubble-wrap' });
        const bubble = createElement('div', { cls: 'm-bubble', text: msg.text });
        const time = createElement('div', { cls: 'm-bubble-time', text: msg.time });
        wrap.append(bubble, time);
        row.append(avatar, wrap);
        body.appendChild(row);
      } else {
        const row = createElement('div', { cls: ['m-bubble-row', 'me'] });
        const wrap = createElement('div', { cls: 'm-bubble-wrap' });
        const bubble = createElement('div', { cls: 'm-bubble', text: msg.text });
        const time = createElement('div', { cls: 'm-bubble-time', text: msg.time });
        wrap.append(bubble, time);
        row.appendChild(wrap);
        body.appendChild(row);
      }
    }

    setTimeout(() => {
      body.scrollTop = body.scrollHeight;
    }, 20);
  }
}
customElements.define('page-beacon-chat', PageBeaconChat);
