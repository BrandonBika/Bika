/**
 * @file apps/resident-pwa/src/pages/lifeline-calling-status/lifeline-calling-status.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { getLastLifelineGroupCall, getLifelineCards } from '../../features/lifeline/lifeline.client.js';
import { createLifelineCallRoom } from '../../features/lifeline/lifeline-calls.js';

export class PageLifelineCallingStatus extends BaseElement {
  init(params) {
    this._groupId = params.groupId;
  }

  async connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-lifeline-status-page');

    const call = getLastLifelineGroupCall();
    const { cards } = await getLifelineCards();
    const group = cards.find((card) => card.id === this._groupId);
    if (!group) {
      navigate('lifeline-home');
      return;
    }

    const header = createElement('div', { cls: 'cn-lifeline-status-header' });
    header.append(
      createElement('h1', { cls: 'cn-lifeline-status-title', text: `${group.name} group · calling` }),
      createElement('p', { cls: 'cn-lifeline-status-subtitle', text: `Group call started for ${group.members.length} ${group.members.length === 1 ? 'person' : 'people'}.` })
    );
    const sectionTitle = createElement('h2', { cls: 'cn-lifeline-status-section', text: 'On this call' });
    const memberList = createElement('div', { cls: 'cn-lifeline-status-list' });
    const callMembers = call?.groupId === group.id ? call.members : group.members;
    for (const member of callMembers) {
      const row = createElement('div', { cls: 'cn-lifeline-status-member' });
      const avatar = createElement('span', { cls: 'cn-lifeline-status-avatar', text: member.name.slice(0, 1).toUpperCase() });
      const details = createElement('div', { cls: 'cn-lifeline-status-details' });
      details.append(
        createElement('span', { cls: 'cn-lifeline-status-name', text: member.name }),
        createElement('span', { cls: 'cn-lifeline-status-phone', text: member.phone })
      );
      const status = createElement('span', { cls: 'cn-lifeline-status-chip', text: member.status === 'ringing' ? 'Ringing' : 'Queued' });
      row.append(avatar, details, status);
      memberList.appendChild(row);
    }
    const callRoom = createLifelineCallRoom();

    const note = createElement('p', { cls: 'cn-lifeline-status-note', text: 'Each person in the group is included in the call request.' });
    const edit = createElement('button', { cls: 'cn-lifeline-status-secondary', text: 'Edit group', attrs: { type: 'button' } });
    edit.onclick = () => navigate('lifeline-card-edit', { groupId: group.id });
    const back = createElement('button', { cls: 'cn-lifeline-status-primary', text: 'Back to Lifeline', attrs: { type: 'button' } });
    back.onclick = () => navigate('lifeline-home');

    this.append(header, sectionTitle, memberList, note, callRoom, edit, back);
  }
}
customElements.define('page-lifeline-calling-status', PageLifelineCallingStatus);
