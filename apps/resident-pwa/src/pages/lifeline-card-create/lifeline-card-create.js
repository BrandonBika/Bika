/**
 * @file apps/resident-pwa/src/pages/lifeline-card-create/lifeline-card-create.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { saveLifelineCard } from '../../features/lifeline/lifeline.client.js';
import { selectLifelineContacts } from '../../features/lifeline/lifeline-contacts.js';

export class PageLifelineCardCreate extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-lifeline-form-page');

    const title = createElement('h1', { cls: 'cn-lifeline-form-title', text: 'New group' });
    const subtitle = createElement('p', { cls: 'cn-lifeline-form-subtitle', text: "Create a group of people you'll call together." });
    const name = createElement('cn-input', { attrs: { label: 'Group name', placeholder: 'e.g. Family', required: 'true' } });
    const icon = createElement('select', { cls: 'cn-lifeline-form-select', attrs: { 'aria-label': 'Group icon' } });
    for (const [value, label] of [['custom', 'People'], ['police', 'Shield'], ['home', 'Home'], ['gbv', 'Heart']]) {
      icon.appendChild(createElement('option', { text: label, attrs: { value } }));
    }
    const color = createElement('select', { cls: 'cn-lifeline-form-select', attrs: { 'aria-label': 'Group color' } });
    for (const [value, label] of [['#EAF3DE', 'Green'], ['#E6F1FB', 'Blue'], ['#FBE4D3', 'Coral'], ['#EEE8F8', 'Lilac'], ['#FAEEDA', 'Amber']]) {
      color.appendChild(createElement('option', { text: label, attrs: { value } }));
    }

    const membersTitle = createElement('h2', { cls: 'cn-lifeline-members-title', text: 'People · 0 / 4' });
    const members = createElement('div', { cls: 'cn-lifeline-member-fields' });
    const addMember = createElement('button', { cls: 'cn-lifeline-add-member', text: '+ Type a number', attrs: { type: 'button' } });
    const pickContacts = createElement('button', { cls: 'cn-lifeline-pick-contacts', text: 'Add from contacts', attrs: { type: 'button' } });
    const saveError = createElement('p', {
      cls: 'cn-lifeline-save-error',
      attrs: { role: 'alert', hidden: 'hidden' }
    });
    const memberRows = [];
    const updateCount = () => {
      membersTitle.textContent = `People · ${memberRows.length} / 4`;
      addMember.disabled = memberRows.length >= 4;
      pickContacts.disabled = memberRows.length >= 4;
    };

    const addMemberRow = (contact = {}) => {
      if (memberRows.length >= 4) return;
      const row = createElement('div', { cls: 'cn-lifeline-member-field' });
      const memberName = createElement('cn-input', { attrs: { label: 'Name', placeholder: 'Brother', value: contact.name || '' } });
      const memberPhone = createElement('cn-input', { attrs: { label: 'Phone number', type: 'tel', autocomplete: 'tel', placeholder: '082 123 4567', value: contact.phone || '' } });
      const remove = createElement('button', { cls: 'cn-lifeline-remove-member', text: 'Remove', attrs: { type: 'button' } });
      remove.onclick = () => {
        const index = memberRows.findIndex((entry) => entry.row === row);
        if (index >= 0) memberRows.splice(index, 1);
        row.remove();
        updateCount();
      };
      row.append(memberName, memberPhone, remove);
      members.appendChild(row);
      memberRows.push({ row, memberName, memberPhone });
      updateCount();
    };

    addMember.onclick = addMemberRow;
    pickContacts.onclick = async () => {
      try {
        const contacts = await selectLifelineContacts();
        const remaining = 4 - memberRows.length;
        for (const contact of contacts.slice(0, remaining)) addMemberRow(contact);
        if (!contacts.length) {
          showToast('No contacts with a name and phone number were selected', { type: 'error' });
        } else if (contacts.length > remaining) {
          showToast('A group can have at most 4 people', { type: 'error' });
        }
      } catch (error) {
        if (error?.name !== 'AbortError') showToast(error.message, { type: 'error' });
      }
    };

    const save = createElement('button', { cls: 'cn-lifeline-save-group', text: 'Save group', attrs: { type: 'button' } });
    save.onclick = async () => {
      const validMembers = memberRows.map((entry, index) => ({
        id: `member-${Date.now()}-${index}`,
        name: entry.memberName.value.trim(),
        phone: entry.memberPhone.value.trim()
      }));
      if (!name.value.trim() || validMembers.length === 0 || validMembers.some((member) => !member.name || !member.phone)) {
        saveError.textContent = 'Add a group name and at least one complete phone number.';
        saveError.hidden = false;
        return;
      }
      try {
        saveError.hidden = true;
        saveError.textContent = '';
        save.disabled = true;
        await saveLifelineCard({
          name: name.value.trim(),
          icon: icon.value,
          color: color.value,
          isPreset: false,
          members: validMembers
        });
        showToast('Group saved', { type: 'success' });
        navigate('lifeline-home', {}, { replace: true });
      } catch (error) {
        save.disabled = false;
        saveError.textContent = error.message || 'Could not save group.';
        saveError.hidden = false;
        showToast(error.message || 'Could not save group', { type: 'error' });
      }
    };

    this.append(title, subtitle, name);
    const iconField = createElement('label', { cls: 'cn-lifeline-select-field', text: 'Icon' });
    iconField.appendChild(icon);
    const colorField = createElement('label', { cls: 'cn-lifeline-select-field', text: 'Colour' });
    colorField.appendChild(color);
    this.append(iconField, colorField, membersTitle, members, addMember, pickContacts, saveError, save);
  }
}
customElements.define('page-lifeline-card-create', PageLifelineCardCreate);
