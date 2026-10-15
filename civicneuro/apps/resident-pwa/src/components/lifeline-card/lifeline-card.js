/**
 * @file apps/resident-pwa/src/components/lifeline-card/lifeline-card.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class CnLifelineCard extends BaseElement {
  set data(card) {
    this._data = card;
    this.render();
  }

  render() {
    if (!this._data) return;
    clearChildren(this);
    const variants = ['police', 'ambulance', 'fire', 'gbv', 'custom'];
    const variant = variants.includes(this._data.icon) ? this._data.icon : 'custom';
    this.classList.add('cn-lifeline-card', `cn-lifeline-card--${variant}`);

    const iconMap = { police: '🛡️', ambulance: '✚', fire: '♨', gbv: '♥', custom: '👥', home: '⌂', heart: '♥' };
    const iconStr = iconMap[this._data.icon] || '📞';
    this.style.backgroundColor = this._data.color || '';

    const edit = createElement('button', {
      cls: 'cn-lifeline-edit',
      text: '✎',
      attrs: { type: 'button', 'aria-label': `Edit ${this._data.name} group` }
    });
    edit.onclick = (event) => {
      event.stopPropagation();
      navigate('lifeline-card-edit', { groupId: this._data.id });
    };

    const call = createElement('button', {
      cls: 'cn-lifeline-call',
      attrs: { type: 'button', 'aria-label': `Call everyone in the ${this._data.name} group` }
    });
    const icon = createElement('span', { cls: 'cn-lifeline-icon', text: iconStr, attrs: { 'aria-hidden': 'true' } });
    const info = createElement('div', { cls: 'cn-lifeline-info' });
    const name = createElement('div', { cls: 'cn-lifeline-name', text: this._data.name });
    const members = Array.isArray(this._data.members) ? this._data.members : [];
    const visibleMembers = members.slice(0, 3).map((member) => member.name).join(' · ');
    const extraCount = Math.max(0, members.length - 3);
    const summary = `${visibleMembers}${extraCount ? ` · +${extraCount}` : ''}`;
    const phone = createElement('div', { cls: 'cn-lifeline-phone', text: summary || 'No people added' });
    info.appendChild(name);
    info.appendChild(phone);

    const callIcon = createElement('span', { cls: 'cn-lifeline-action', text: '📞 Tap to call', attrs: { 'aria-hidden': 'true' } });

    call.append(icon, info, callIcon);
    this.append(edit, call);

    call.onclick = () => {
      navigate('lifeline-call-countdown', { groupId: this._data.id });
    };
  }
}
customElements.define('cn-lifeline-card', CnLifelineCard);
