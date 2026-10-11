/**
 * @file apps/resident-pwa/src/components/circle-member-row/circle-member-row.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class CnCircleMemberRow extends BaseElement {
  set data(member) {
    this._data = member;
    this.render();
  }

  render() {
    if (!this._data) return;
    clearChildren(this);
    this.classList.add('cn-circle-member-row');

    const info = createElement('div', { cls: 'cn-circle-member-info' });
    const name = createElement('span', { cls: 'cn-circle-member-name', text: this._data.name });
    const status = createElement('span', {
      cls: ['cn-circle-member-status', this._data.isSharing ? 'is-sharing' : ''],
      text: this._data.isSharing ? 'Sharing live location' : 'Not sharing'
    });
    info.append(name, status);

    const shareBtn = createElement('button', {
      cls: 'cn-circle-member-action',
      text: this._data.isSharing ? '◉' : 'Share',
      attrs: {
        type: 'button',
        title: this._data.isSharing ? 'Open conversation' : 'Share live location',
        'aria-label': this._data.isSharing ? `Message ${this._data.name}` : `Share live location with ${this._data.name}`
      }
    });
    shareBtn.onclick = () => navigate(
      this._data.isSharing ? 'beacon-chat' : 'beacon-start-confirm',
      this._data.isSharing
        ? { memberId: this._data.id, name: this._data.name }
        : { mode: 'live', memberId: this._data.id, name: this._data.name }
    );

    const avatar = createElement('span', {
      cls: ['cn-circle-member-avatar', this._data.isSharing ? 'is-sharing' : ''],
      text: this._data.name.trim().slice(0, 1).toUpperCase()
    });
    this.appendChild(avatar);
    this.appendChild(info);
    this.appendChild(shareBtn);
  }
}
customElements.define('cn-circle-member-row', CnCircleMemberRow);
