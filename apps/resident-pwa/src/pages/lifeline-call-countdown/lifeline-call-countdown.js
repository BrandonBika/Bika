/**
 * @file apps/resident-pwa/src/pages/lifeline-call-countdown/lifeline-call-countdown.js
 * 3-second mandatory cancel countdown before dispatching a Lifeline group call.
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { getLifelineCards, startLifelineGroupCall } from '../../features/lifeline/lifeline.client.js';

export class PageLifelineCallCountdown extends BaseElement {
  init(params) {
    this._groupId = params.groupId;
  }

  async connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-lifeline-countdown-page');

    const { cards } = await getLifelineCards();
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
      if (this._dispatching) return;
      this._dispatching = true;
      cancelBtn.disabled = true;
      try {
        await startLifelineGroupCall(this._groupId);
        navigate('lifeline-calling-status', { groupId: this._groupId });
      } catch (error) {
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

    this.append(header, title, subtitle, people, timer, cancelBtn);
  }

  disconnectedCallback() {
    clearInterval(this._interval);
  }
}
customElements.define('page-lifeline-call-countdown', PageLifelineCallCountdown);
