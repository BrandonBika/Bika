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
  sendChatLocation,
  subscribeBeacon,
  subscribeBeaconCircle,
  subscribeToBeaconChat
} from '../../features/beacon/beacon.client.js';
import {
  block as blockUser,
  removeConnection
} from '../../features/beacon/beacon-circle.client.js';
import {
  BEACON_MAX_REDUCED_ACCURACY_METERS,
  requestCurrentLocation
} from '../../features/beacon/beacon-location.js';
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
      if (!this.isConnected || this._memberActionInProgress) return;
      if (!getMemberById(this._memberId)) {
        this.closeChat('This conversation is no longer available.');
        return;
      }
      this._messages = getChatMessages(this._memberId);
      this.renderMessages();
    });
    this._unsubscribeCircle = subscribeBeaconCircle(() => {
      this.closeChat('This conversation is no longer available.');
    });
    this._onOnline = () => {
      this.reloadConversation().catch(() => {
        console.error('Could not refresh Beacon chat after reconnect.');
        this.closeChat('This conversation is no longer available.');
      });
    };
    window.addEventListener('online', this._onOnline);

    this.openConversation().catch(() => {
      console.error('Could not open Beacon chat.');
      this._opening = false;
      if (this.isConnected) this.closeChat('Could not open this conversation.');
    });
  }

  disconnectedCallback() {
    this._locationShareController?.abort();
    this.closeLocationShareSheet();
    if (this._unsubscribe) this._unsubscribe();
    if (this._unsubscribeCircle) this._unsubscribeCircle();
    if (this._unsubscribeChat) this._unsubscribeChat();
    window.removeEventListener('online', this._onOnline);
    super.disconnectedCallback();
  }

  closeChat(message) {
    if (this._closing) return;
    this._closing = true;
    if (message) showToast(message, { type: 'info' });
    clearChildren(this);
    this._chatBody = null;
    this._textInput = null;
    this._memberActionDialog = null;
    this._locationShareSheet?.remove();
    this._locationShareSheet = null;
    navigate('beacon-home');
  }

  openLocationShareSheet() {
    this._locationShareSheet?.remove();
    const member = this._member;
    const backdrop = createElement('div', {
      cls: 'chat-member-actions-backdrop',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': `Share your current location with ${member.name}`
      }
    });
    const sheet = createElement('section', { cls: 'chat-member-actions-sheet' });
    sheet.append(
      createElement('h2', {
        cls: 'chat-member-actions-title',
        text: `Send your current location to ${member.name}?`
      }),
      createElement('p', {
        cls: 'chat-member-actions-copy',
        text: 'They will see where you are right now. This is a one-time share, not live tracking.'
      })
    );
    const sendButton = createElement('button', {
      cls: 'chat-member-action',
      attrs: { type: 'button' },
      text: 'Send location'
    });
    const cancelButton = createElement('button', {
      cls: 'chat-member-action-cancel',
      attrs: { type: 'button' },
      text: 'Cancel'
    });
    this._locationShareButtons = [sendButton, cancelButton];
    sendButton.onclick = () => this.sendOneTimeLocation();
    cancelButton.onclick = () => this.closeLocationShareSheet();
    backdrop.onclick = (event) => {
      if (event.target === backdrop && !this._locationShareInProgress) {
        this.closeLocationShareSheet();
      }
    };
    sheet.append(sendButton, cancelButton);
    backdrop.appendChild(sheet);
    this._locationShareSheet = backdrop;
    this.appendChild(backdrop);
  }

  closeLocationShareSheet() {
    this._locationShareSheet?.remove();
    this._locationShareSheet = null;
    this._locationShareButtons = [];
  }

  async sendOneTimeLocation() {
    if (this._locationShareInProgress) return;
    this._locationShareInProgress = true;
    this._locationShareController = new AbortController();
    for (const button of this._locationShareButtons || []) button.disabled = true;
    try {
      const location = await requestCurrentLocation({
        force: true,
        firstFix: true,
        timeoutMs: 10000,
        signal: this._locationShareController.signal
      });
      if (!this.isConnected) return;
      if (location.accuracy > BEACON_MAX_REDUCED_ACCURACY_METERS) {
        showToast(
          "Your location isn't accurate enough yet. Try again outdoors or on your phone.",
          { type: 'error' }
        );
        return;
      }
      await sendChatLocation(this._memberId, {
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy
      });
      this._messages = getChatMessages(this._memberId);
      this.renderMessages();
      this.closeLocationShareSheet();
      showToast('Location shared once in this chat.', { type: 'success' });
    } catch (error) {
      if (!this.isConnected || error?.name === 'AbortError') return;
      const message = error?.code === 1
        ? 'Location permission was denied. Allow location access and try again.'
        : error?.code === 3
          ? "Couldn't get your location in time. Try again outdoors or on your phone."
          : 'Could not send your location. Please try again.';
      showToast(message, { type: 'error' });
    } finally {
      this._locationShareInProgress = false;
      this._locationShareController = null;
      for (const button of this._locationShareButtons || []) button.disabled = false;
    }
  }

  openMemberActions() {
    this._memberActionDialog?.remove();
    const member = this._member;
    const backdrop = createElement('div', {
      cls: 'chat-member-actions-backdrop',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': `Actions for ${member.name}`
      }
    });
    const sheet = createElement('section', { cls: 'chat-member-actions-sheet' });
    sheet.append(
      createElement('h2', { cls: 'chat-member-actions-title', text: member.name }),
      createElement('p', {
        cls: 'chat-member-actions-copy',
        text: 'Choose how to manage this circle connection.'
      })
    );
    const removeButton = createElement('button', {
      cls: 'chat-member-action',
      attrs: { type: 'button' },
      text: 'Remove from circle'
    });
    const blockButton = createElement('button', {
      cls: ['chat-member-action', 'danger'],
      attrs: { type: 'button' },
      text: 'Block'
    });
    const cancelButton = createElement('button', {
      cls: 'chat-member-action-cancel',
      attrs: { type: 'button' },
      text: 'Cancel'
    });
    this._memberActionButtons = [removeButton, blockButton];
    removeButton.onclick = () => this.runMemberAction('remove');
    blockButton.onclick = () => this.runMemberAction('block');
    cancelButton.onclick = () => {
      backdrop.remove();
      this._memberActionDialog = null;
    };
    backdrop.onclick = (event) => {
      if (event.target === backdrop) cancelButton.onclick();
    };
    sheet.append(removeButton, blockButton, cancelButton);
    backdrop.appendChild(sheet);
    this._memberActionDialog = backdrop;
    this.appendChild(backdrop);
  }

  async runMemberAction(action) {
    const member = this._member;
    const isBlock = action === 'block';
    const confirmation = isBlock
      ? 'They will be removed, cannot find or message you, and cannot send you requests.'
      : 'They will no longer see your chat or be able to message you. You can add them again later.';
    if (!window.confirm(`${isBlock ? 'Block' : 'Remove'} ${member.name}? ${confirmation}`)) return;

    this._memberActionInProgress = true;
    for (const button of this._memberActionButtons || []) button.disabled = true;
    try {
      if (isBlock) await blockUser(member.id);
      else await removeConnection(member.id);
      await refreshBeaconCircle();
      showToast(isBlock ? 'Resident blocked.' : 'Resident removed from your circle.', { type: 'success' });
      this.closeChat();
    } catch {
      this._memberActionInProgress = false;
      showToast('Could not update your circle. Please try again.', { type: 'error' });
      for (const button of this._memberActionButtons || []) button.disabled = false;
    }
  }

  async openConversation() {
    await refreshBeaconCircle();
    if (!this.isConnected) return;
    const member = getMemberById(this._memberId);
    if (!member) {
      this._opening = false;
      this.closeChat();
      return;
    }

    const subscription = await subscribeToBeaconChat(this._memberId, () => {
      console.error('Beacon chat Realtime subscription failed.');
      if (this.isConnected) this.closeChat('This conversation is no longer available.');
    });
    if (!subscription) return;
    this._unsubscribeChat = () => subscription.unsubscribe();
    await subscription.ready;
    if (!this.isConnected) return;
    await refreshChatMessages(this._memberId);
    this._messages = getChatMessages(this._memberId);
    await refreshBeaconCircle();
    if (!getMemberById(this._memberId)) {
      this._opening = false;
      this.closeChat();
      return;
    }
    this._opening = false;
    if (this.isConnected) this.render();
  }

  async reloadConversation() {
    if (!this._memberId || !this.isConnected) return;
    await refreshBeaconCircle();
    if (!getMemberById(this._memberId)) {
      this.closeChat('This conversation is no longer available.');
      return;
    }
    this._messages = await refreshChatMessages(this._memberId);
  }

  render() {
    if (this._opening) {
      clearChildren(this);
      return;
    }
    const member = getMemberById(this._memberId);
    if (!member) {
      this.closeChat();
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
    this._member = member;

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

    const moreButton = createElement('button', {
      cls: 'chat-member-more-btn',
      attrs: {
        type: 'button',
        'aria-label': `More actions for ${member.name}`,
        title: 'More actions'
      },
      text: '⋯'
    });
    moreButton.onclick = () => this.openMemberActions();
    header.append(backBtn, headerText, moreButton);
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
        'aria-label': 'Share your current location once',
        title: 'Send a one-time location message'
      }
    });
    sharePinBtn.appendChild(BeaconIcons.pin(13, 'var(--beacon-deep, #0E5961)'));
    sharePinBtn.onclick = () => this.openLocationShareSheet();

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
      } else if (msg.kind === 'location') {
        const row = createElement('div', {
          cls: ['m-bubble-row', msg.sender === 'them' ? 'theirs' : 'me']
        });
        if (msg.sender === 'them') {
          row.appendChild(createElement('div', { cls: 'chat-avatar', text: this._member.initial }));
        }
        const wrap = createElement('div', { cls: 'm-bubble-wrap' });
        const card = createElement('div', { cls: 'm-bubble m-location-card' });
        const { lat, lng, accuracy } = msg.payload || {};
        if (
          !Number.isFinite(lat) || lat < -90 || lat > 90
          || !Number.isFinite(lng) || lng < -180 || lng > 180
        ) {
          card.appendChild(createElement('strong', { text: 'Location unavailable' }));
        } else {
          card.append(
            createElement('strong', { text: 'Shared location' }),
            createElement('span', { text: `Shared at ${msg.time}` })
          );
          if (Number.isFinite(accuracy) && accuracy >= 0) {
            card.appendChild(createElement('span', {
              text: `Accuracy ±${Math.round(accuracy)} m`
            }));
          }
          card.appendChild(createElement('a', {
            attrs: {
              href: `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`,
              rel: 'noopener noreferrer',
              target: '_blank'
            },
            text: 'Open in Maps'
          }));
        }
        wrap.appendChild(card);
        row.appendChild(wrap);
        body.appendChild(row);
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
