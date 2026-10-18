/**
 * @file apps/resident-pwa/src/pages/lifeline-card-edit/lifeline-card-edit.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { getLifelineCards, saveLifelineCard } from '../../features/lifeline/lifeline.client.js';
import { showToast } from '@civicneuro/ui';
import { selectLifelineContacts } from '../../features/lifeline/lifeline-contacts.js';
import '../../components/back-button/back-button.js';

export class PageLifelineCardEdit extends BaseElement {
  init(params) {
    this._groupId = params.groupId;
  }

  async connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-lifeline-form-page', 'cn-lifeline-edit-page');

    let cards;
    try {
      ({ cards } = await getLifelineCards());
    } catch (error) {
      showToast(error.message || 'Could not load Lifeline groups', { type: 'error' });
      navigate('lifeline-home');
      return;
    }
    this._group = cards.find((card) => card.id === this._groupId);
    if (!this._group) {
      showToast('Lifeline group not found', { type: 'error' });
      navigate('lifeline-home');
      return;
    }
    this._group.members = Array.isArray(this._group.members) ? this._group.members : [];

    const header = createElement('header', { cls: 'cn-lifeline-edit-header' });
    const heading = createElement('div');
    heading.append(
      createElement('h1', { cls: 'cn-lifeline-form-title', text: this._group.name }),
      createElement('p', { cls: 'cn-lifeline-form-subtitle', text: 'Edit group members' })
    );
    header.append(createElement('cn-back-button', { attrs: { fallback: 'lifeline-home' } }), heading);

    this._memberCount = createElement('h2', { cls: 'cn-lifeline-members-title' });
    this._memberList = createElement('div', { cls: 'cn-lifeline-member-list' });
    this._pickContacts = createElement('button', { cls: 'cn-lifeline-pick-contacts', text: 'Add from contacts', attrs: { type: 'button' } });
    this._pickContacts.onclick = () => this.pickContacts();
    this._addMember = createElement('button', { cls: 'cn-lifeline-add-member', text: '+ Add a number', attrs: { type: 'button' } });
    this._addMember.onclick = () => this.showMemberForm();
    this._save = createElement('button', { cls: 'cn-lifeline-save-group', text: 'Save group', attrs: { type: 'button' } });
    this._save.onclick = () => this.saveGroup();

    this.append(header, this._memberCount, this._memberList, this._pickContacts, this._addMember);
    this.renderMembers();
    this.appendChild(this._save);
  }

  renderMembers() {
    clearChildren(this._memberList);
    this._memberCount.textContent = `People on this group · ${this._group.members.length} / 4`;
    this._pickContacts.disabled = this._group.members.length >= 4;
    this._addMember.disabled = this._group.members.length >= 4;

    for (const member of this._group.members) {
      const row = createElement('div', { cls: 'cn-lifeline-edit-member' });
      const avatar = createElement('span', { cls: 'cn-lifeline-member-avatar', text: member.name.trim().slice(0, 1).toUpperCase() || '?' });
      const details = createElement('div', { cls: 'cn-lifeline-edit-member-details' });
      details.append(
        createElement('span', { cls: 'cn-lifeline-edit-member-name', text: member.name }),
        createElement('span', { cls: 'cn-lifeline-edit-member-phone', text: member.phone })
      );
      const remove = createElement('button', { cls: 'cn-lifeline-remove-saved-member', text: '×', attrs: { type: 'button', 'aria-label': `Remove ${member.name}` } });
      remove.onclick = () => {
        this._group.members = this._group.members.filter((entry) => entry.id !== member.id);
        this.renderMembers();
      };
      row.append(avatar, details, remove);
      this._memberList.appendChild(row);
    }
  }

  async pickContacts() {
    try {
      const contacts = await selectLifelineContacts();
      const remaining = 4 - this._group.members.length;
      for (const contact of contacts.slice(0, remaining)) {
        this._group.members.push({
          id: `member-${Date.now()}-${this._group.members.length}`,
          name: contact.name,
          phone: contact.phone
        });
      }
      if (!contacts.length) {
        showToast('No contacts with a name and phone number were selected', { type: 'error' });
      } else if (contacts.length > remaining) {
        showToast('A group can have at most 4 people', { type: 'error' });
      }
      this.renderMembers();
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(error.message, { type: 'error' });
    }
  }

  showMemberForm() {
    if (this._group.members.length >= 4 || this.querySelector('.cn-lifeline-new-member')) return;

    const form = createElement('section', { cls: 'cn-lifeline-new-member' });
    const memberName = createElement('cn-input', { attrs: { label: 'Name', placeholder: 'Brother' } });
    const memberPhone = createElement('cn-input', { attrs: { label: 'Phone number', type: 'tel', autocomplete: 'tel', placeholder: '082 123 4567' } });
    const actions = createElement('div', { cls: 'cn-lifeline-new-member-actions' });
    const cancel = createElement('button', { cls: 'cn-lifeline-cancel-member', text: 'Cancel', attrs: { type: 'button' } });
    cancel.onclick = () => form.remove();
    const add = createElement('button', { cls: 'cn-lifeline-confirm-member', text: 'Add to group', attrs: { type: 'button' } });
    add.onclick = () => {
      const name = memberName.value.trim();
      const phone = memberPhone.value.trim();
      if (!name || !phone) {
        showToast('Enter a name and phone number', { type: 'error' });
        return;
      }
      if (this._group.members.length >= 4) {
        showToast('A group can have at most 4 people', { type: 'error' });
        return;
      }
      this._group.members.push({ id: `member-${Date.now()}`, name, phone });
      form.remove();
      this.renderMembers();
    };
    actions.append(cancel, add);
    form.append(memberName, memberPhone, actions);
    this._memberList.appendChild(form);
  }

  async saveGroup() {
    try {
      this._save.disabled = true;
      await saveLifelineCard(this._group);
      showToast('Group saved', { type: 'success' });
      navigate('lifeline-home');
    } catch (error) {
      this._save.disabled = false;
      showToast(error.message || 'Could not save group', { type: 'error' });
    }
  }
}
customElements.define('page-lifeline-card-edit', PageLifelineCardEdit);
