/**
 * @file apps/resident-pwa/src/pages/beacon-find-contacts/beacon-find-contacts.js
 * Select phone contacts or enter a contact to invite to CivicNeuro.
 */

import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import {
  getSavedBeaconContacts,
  markBeaconContactInvitePrepared,
  saveBeaconContactsToAccount
} from '../../features/beacon/beacon.client.js';
import { navigate } from '../../router.js';

function normalizePhone(phone) {
  const value = String(phone || '').trim();
  const digits = value.replace(/\D/g, '');
  return value.startsWith('+') ? `+${digits}` : digits;
}

function isValidPhone(phone) {
  const digits = normalizePhone(phone).replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function getContactErrorMessage(action, error) {
  if (error?.code === 'PGRST205' || error?.code === '42P01') {
    return 'Beacon contacts are not set up in Supabase yet. In Supabase Dashboard → SQL Editor, run supabase/migrations/0029_beacon_contacts.sql, then reload this page.';
  }
  return `${action}: ${error?.message || 'An unexpected error occurred.'}`;
}

export class PageBeaconFindContacts extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-find-page');
    this._contacts = [];
    this._contactMessage = '';
    this._contactLoading = true;
    this._contactSaving = false;
    this._loadGeneration = (this._loadGeneration || 0) + 1;
    this.render();
    this.loadContacts(this._loadGeneration);
  }

  disconnectedCallback() {
    this._loadGeneration += 1;
  }

  async loadContacts(generation) {
    try {
      const contacts = await getSavedBeaconContacts();
      if (generation !== this._loadGeneration) return;
      this._contacts = contacts;
    } catch (error) {
      if (generation !== this._loadGeneration) return;
      this._contactMessage = getContactErrorMessage('Could not load saved contacts', error);
    } finally {
      if (generation === this._loadGeneration) {
        this._contactLoading = false;
        this.render();
      }
    }
  }

  render() {
    clearChildren(this);

    const header = createElement('div', { cls: 'find-header' });
    const backBtn = createElement('button', {
      cls: 'find-back-btn',
      attrs: { type: 'button', 'aria-label': 'Back to Add to circle', id: 'find-back-btn' }
    });
    backBtn.appendChild(BeaconIcons.back(13));
    backBtn.onclick = () => navigate('beacon-add-to-circle');
    const headerText = createElement('div');
    headerText.append(
      createElement('div', { cls: 'find-title', text: 'Choose or add a contact' }),
      createElement('div', {
        cls: 'find-sub',
        text: 'Invite people to join CivicNeuro'
      })
    );
    header.append(backBtn, headerText);
    this.appendChild(header);

    const picker = createElement('button', {
      cls: 'find-picker-btn',
      attrs: {
        type: 'button',
        id: 'find-phone-contacts-btn',
        ...(this._contactLoading || this._contactSaving ? { disabled: 'disabled' } : {})
      },
      text: 'Choose from phone contacts'
    });
    picker.onclick = () => this.pickPhoneContacts();
    this.appendChild(picker);

    const form = createElement('form', {
      cls: 'find-add-form',
      attrs: { id: 'find-add-contact-form' }
    });
    form.appendChild(createElement('h2', {
      cls: 'find-section-label first',
      text: 'Add someone now'
    }));
    const nameInput = createElement('input', {
      attrs: {
        type: 'text',
        name: 'name',
        autocomplete: 'name',
        maxlength: '100',
        required: 'required',
        placeholder: 'Contact name',
        value: this._contactDraft?.name || '',
        'aria-label': 'Contact name'
      }
    });
    const phoneInput = createElement('input', {
      attrs: {
        type: 'tel',
        name: 'phone',
        autocomplete: 'tel',
        maxlength: '24',
        required: 'required',
        placeholder: 'Phone number',
        value: this._contactDraft?.phone || '',
        'aria-label': 'Contact phone number'
      }
    });
    const addBtn = createElement('button', {
      cls: 'find-picker-btn',
      attrs: { type: 'submit' },
      text: 'Add contact'
    });
    addBtn.disabled = this._contactLoading || this._contactSaving;
    form.append(nameInput, phoneInput, addBtn);
    form.onsubmit = async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const phone = normalizePhone(phoneInput.value);
      if (!name || !isValidPhone(phone)) {
        this._contactDraft = { name, phone: phoneInput.value };
        this._contactMessage = 'Enter a name and a valid phone number.';
        this.render();
        return;
      }
      this._contactDraft = { name, phone };
      await this.addContacts([{ name, phone }]);
    };
    this.appendChild(form);

    this.appendChild(createElement('p', {
      cls: 'find-contact-privacy',
      text: 'Only contacts you choose or enter are saved to your CivicNeuro account. Your address book is not copied or changed. An invite does not add someone to your circle; they must join and accept.'
    }));
    if (this._contactMessage) {
      this.appendChild(createElement('p', {
        cls: 'find-contact-message',
        attrs: { role: 'status', 'aria-live': 'polite' },
        text: this._contactMessage
      }));
    }

    const listTitle = createElement('h2', {
      cls: 'find-section-label',
      text: `Saved contacts · ${this._contacts.length}`
    });
    this.appendChild(listTitle);
    if (this._contactLoading) {
      this.appendChild(createElement('p', {
        cls: 'find-contact-empty',
        attrs: { role: 'status' },
        text: 'Loading your saved contacts…'
      }));
      return;
    }
    if (this._contacts.length === 0) {
      this.appendChild(createElement('p', {
        cls: 'find-contact-empty',
        text: 'Choose people from your phone or add a contact above.'
      }));
      return;
    }

    const list = createElement('div', { attrs: { 'aria-label': 'Contacts ready to invite' } });
    for (const contact of this._contacts) {
      const row = createElement('div', { cls: 'bc-request-row' });
      row.append(
        createElement('div', {
          cls: 'bc-avatar',
          text: contact.name.charAt(0).toUpperCase()
        })
      );
      const textCol = createElement('div', { cls: 'bc-text' });
      textCol.append(
        createElement('div', { cls: 'bc-name', text: contact.name }),
        createElement('div', {
          cls: 'bc-meta',
          text: `${contact.phone} · ${contact.invitation_status === 'message_prepared' ? 'Message prepared' : 'Saved'}`
        })
      );
      const inviteBtn = createElement('button', {
        cls: ['bc-pillbtn', 'primary'],
        attrs: {
          type: 'button',
          ...(this._contactSaving ? { disabled: 'disabled' } : {})
        },
        text: contact.invitation_status === 'message_prepared' ? 'Invite again' : 'Invite'
      });
      inviteBtn.onclick = () => this.inviteContact(contact);
      row.append(textCol, inviteBtn);
      list.appendChild(row);
    }
    this.appendChild(list);
  }

  async pickPhoneContacts() {
    if (!navigator.contacts?.select) {
      this._contactMessage = 'This browser cannot open the phone contact picker. Add the person’s name and number below instead.';
      this.render();
      return;
    }
    try {
      const selected = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      const contacts = selected
        .map((contact) => ({
          name: Array.isArray(contact.name) ? contact.name[0] : contact.name,
          phone: Array.isArray(contact.tel) ? contact.tel[0] : contact.tel
        }))
        .filter((contact) => typeof contact.name === 'string'
          && contact.name.trim()
          && isValidPhone(contact.phone));
      if (contacts.length) {
        await this.addContacts(contacts);
      } else {
        this._contactMessage = 'No contacts with a name and phone number were selected.';
        this.render();
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      this._contactMessage = `Could not read phone contacts: ${error.message || 'contact picker unavailable'}. You can add the contact manually below.`;
      this.render();
    }
  }

  async addContacts(contacts) {
    const candidates = contacts
      .map((contact) => ({
        name: String(contact.name || '').trim(),
        phone: normalizePhone(contact.phone)
      }))
      .filter((contact) => contact.name && isValidPhone(contact.phone));
    const uniqueCandidates = new Map();
    for (const contact of candidates) {
      uniqueCandidates.set(contact.phone.replace(/\D/g, ''), contact);
    }
    if (!uniqueCandidates.size) return;

    this._contactSaving = true;
    this._contactMessage = 'Saving contacts to your CivicNeuro account…';
    this.render();
    try {
      const saved = await saveBeaconContactsToAccount([...uniqueCandidates.values()]);
      const contactsById = new Map(this._contacts.map((contact) => [contact.id, contact]));
      const contactsByPhone = new Map(this._contacts.map(
        (contact) => [contact.phone_normalized, contact]
      ));
      for (const contact of saved) {
        const existing = contactsByPhone.get(contact.phone_normalized);
        contactsById.set(contact.id, existing
          ? { ...existing, ...contact }
          : contact);
      }
      this._contacts = [...contactsById.values()];
      this._contactDraft = null;
      this._contactMessage = `${saved.length} contact${saved.length === 1 ? '' : 's'} saved to your CivicNeuro account.`;
    } catch (error) {
      this._contactMessage = getContactErrorMessage('Could not save contacts', error);
    } finally {
      this._contactSaving = false;
      this.render();
    }
  }

  async inviteContact(contact) {
    const inviteUrl = new URL('#register', window.location.href).href;
    const body = encodeURIComponent(`Join me on CivicNeuro: ${inviteUrl}`);
    const phone = normalizePhone(contact.phone);
    this._contactSaving = true;
    this._contactMessage = 'Preparing your message…';
    this.render();
    try {
      const updatedContact = await markBeaconContactInvitePrepared(contact.id);
      this._contacts = this._contacts.map((savedContact) => (
        savedContact.id === updatedContact.id ? updatedContact : savedContact
      ));
      this._contactMessage = 'Your messaging app is opening. The invite is not marked as delivered or accepted.';
      this.render();
      window.location.href = `sms:${phone}?body=${body}`;
    } catch (error) {
      this._contactMessage = getContactErrorMessage('Could not prepare the invite', error);
      this.render();
    } finally {
      this._contactSaving = false;
      this.render();
    }
  }
}
customElements.define('page-beacon-find-contacts', PageBeaconFindContacts);
