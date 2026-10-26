/**
 * @file apps/resident-pwa/src/pages/lifeline-call-countdown/lifeline-call-countdown.js
 * 3-second mandatory cancel countdown before dispatching a Lifeline group call.
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import {
  getLifelineCards,
  isLifelineCallSession,
  redirectGuestLifelineCall,
  startLifelineGroupCall,
  withLifelineCallTimeout
} from '../../features/lifeline/lifeline.client.js';
import { createLifelineCallRoom } from '../../features/lifeline/lifeline-calls.js';
import { sessionStore } from '../../session.js';

export class PageLifelineCallCountdown extends BaseElement {
  init(params) {
    this._groupId = params.groupId;
  }

  async connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-lifeline-countdown-page');

    if (redirectGuestLifelineCall(sessionStore.get(), { showToast, navigate })) return;

    let cards;
    try {
      ({ cards } = await getLifelineCards());
    } catch (error) {
      showToast(error.message || 'Could not load Lifeline groups', { type: 'error' });
      navigate('lifeline-home');
      return;
    }
    this._group = cards.find((card) => card.id === this._groupId);
    if (!this._group || !this._group.members?.length) {
      showToast('This group has no members to call', { type: 'error' });
      navigate('lifeline-home');
      return;
    }

    let seconds = 3;

    const header = createElement('div', { cls: 'cn-lifeline-countdown-icon', text: '☎' });
    const title = createElement('h1', { cls: 'cn-lifeline-countdown-title', text: `Calling your ${this._group.name} group` });
    const subtitle = createElement('p', { cls: 'cn-lifeline-countdown-copy', text: `Calling ${this._group.members.length} ${this._group.members.length === 1 ? 'person' : 'people'} in this group.` });
    const people = createElement('div', { cls: 'cn-lifeline-countdown-members' });
    const callRoom = createLifelineCallRoom();
    for (const member of this._group.members) {
      const row = createElement('div', { cls: 'cn-lifeline-countdown-member' });
      row.append(
        createElement('span', { cls: 'cn-lifeline-countdown-name', text: member.name }),
        createElement('span', { cls: 'cn-lifeline-countdown-phone', text: member.phone })
      );
      people.appendChild(row);
    }

    const timer = createElement('div', { cls: 'cn-lifeline-countdown-timer', text: String(seconds), attrs: { 'aria-live': 'polite' } });

    const cancelBtn = createElement('button', {
      cls: 'cn-lifeline-countdown-cancel',
      text: 'Cancel',
      attrs: { type: 'button' }
    });

    const dispatchCall = async () => {
      if (!isLifelineCallSession(sessionStore.get())) {
        this._dispatching = false;
        cancelBtn.disabled = false;
        showToast('Sign in to use Lifeline calls', { type: 'error' });
        return;
      }
      if (this._dispatching) return;
      this._dispatching = true;
      cancelBtn.disabled = true;
      try {
        await withLifelineCallTimeout(startLifelineGroupCall(this._groupId));
        navigate('lifeline-calling-status', { groupId: this._groupId }, { replace: true });
      } catch (error) {
        console.error('[lifeline] dispatch failed', error);
        this._dispatching = false;
        cancelBtn.disabled = false;
        showToast(error.message || 'Could not start group call', { type: 'error' });
      }
    };

    this._interval = setInterval(() => {
      seconds--;
      if (seconds > 0) {
        timer.textContent = String(seconds);
      } else {
        clearInterval(this._interval);
        dispatchCall();
      }
    }, 1000);

    cancelBtn.onclick = () => {
      clearInterval(this._interval);
      navigate('lifeline-home');
    };

    this.append(header, title, subtitle, people, timer, cancelBtn, callRoom);
  }

  disconnectedCallback() {
    clearInterval(this._interval);
  }
}
customElements.define('page-lifeline-call-countdown', PageLifelineCallCountdown);
