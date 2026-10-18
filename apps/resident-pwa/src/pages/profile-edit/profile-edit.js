/**
 * @file apps/resident-pwa/src/pages/profile-edit/profile-edit.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getResidentProfile, updateResidentProfile, updateUserEmail } from '@civicneuro/supabase-client';
import { goBack } from '../../router.js';
import { sessionStore } from '../../session.js';
import '../../components/back-button/back-button.js';

export class PageProfileEdit extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-profile-edit-page');
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'account' } }));

    const session = sessionStore.get();
    const ownerId = session.user?.id;
    if (!session.isAuthenticated || session.isGuest || !ownerId) {
      showToast('Sign in with a resident account to edit your profile.', { type: 'error' });
      return;
    }

    let profile;
    try {
      profile = await getResidentProfile(ownerId);
    } catch (error) {
      showToast(error.message || 'Your profile could not be loaded.', { type: 'error' });
      return;
    }

    const initialValues = {
      name: profile.full_name || '',
      phone: String(profile.phone || '').replace(/\D/g, ''),
      email: session.user.email || profile.email || '',
      address: profile.address || ''
    };
    const fields = {};
    const form = createElement('form', { cls: 'cn-profile-form' });

    const config = [
      { key: 'name', label: 'FULL NAME', type: 'text' },
      { key: 'phone', label: 'PHONE', type: 'tel' },
      { key: 'email', label: 'EMAIL', type: 'email' },
      { key: 'address', label: 'ADDRESS', type: 'text' }
    ];

    config.forEach(({ key, label, type }) => {
      const fieldWrap = createElement('label', { cls: 'cn-profile-field' });
      const caption = createElement('span', { cls: 'cn-profile-field__label', text: label });
      const input = createElement('input', {
        cls: 'cn-profile-input',
        attrs: {
          type,
          value: initialValues[key],
          name: key,
          autocomplete: key === 'email' ? 'email' : 'on'
        }
      });
      fieldWrap.append(caption, input);
      form.appendChild(fieldWrap);
      fields[key] = input;
    });

    const note = createElement('p', {
      cls: 'cn-profile-note',
      text: 'Changing your email will send a new confirmation link before it takes effect.'
    });

    const saveBtn = createElement('button', {
      cls: 'cn-profile-save',
      text: 'Save changes',
      attrs: { type: 'submit' }
    });

    const validateForm = () => {
      const values = {
        name: fields.name.value.trim(),
        phone: fields.phone.value.replace(/\D/g, ''),
        email: fields.email.value.trim(),
        address: fields.address.value.trim()
      };
      const hasChanges = Object.entries(values).some(([key, value]) => value !== initialValues[key]);
      const valid = values.name && values.phone.length >= 7 && values.phone.length <= 15 &&
        values.address && /\S+@\S+\.\S+/.test(values.email);
      saveBtn.disabled = !(hasChanges && valid);
      saveBtn.classList.toggle('is-disabled', !(hasChanges && valid));
    };

    Object.values(fields).forEach((input) => input.addEventListener('input', validateForm));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (saveBtn.disabled) return;
      saveBtn.disabled = true;
      let profileSaved = false;
      try {
        const profileChanges = {};
        const name = fields.name.value.trim();
        const phone = fields.phone.value.replace(/\D/g, '');
        const address = fields.address.value.trim();
        const email = fields.email.value.trim();
        if (name !== initialValues.name) profileChanges.full_name = name;
        if (phone !== initialValues.phone.replace(/\D/g, '')) profileChanges.phone = phone;
        if (address !== initialValues.address) profileChanges.address = address;

        if (Object.keys(profileChanges).length) {
          await updateResidentProfile(ownerId, profileChanges);
          profileSaved = true;
          sessionStore.update((current) => ({
            ...current,
            user: {
              ...current.user,
              fullName: name,
              phone,
              address
            }
          }));
        }
        const emailChanged = email !== initialValues.email;
        if (emailChanged) await updateUserEmail(email);

        showToast(
          emailChanged
            ? 'Profile saved. Check your inbox to confirm the email change.'
            : 'Profile updated',
          { type: 'success' }
        );
        goBack('account');
      } catch (error) {
        showToast(
          profileSaved
            ? `Profile details were saved, but the email change failed: ${error.message}`
            : error.message || 'Your profile could not be updated.',
          { type: 'error' }
        );
        saveBtn.disabled = false;
      }
    });

    form.appendChild(note);
    form.appendChild(saveBtn);
    this.appendChild(createElement('h1', { cls: 'cn-profile-title', text: 'Edit profile' }));
    this.appendChild(form);
    validateForm();
  }
}
customElements.define('page-profile-edit', PageProfileEdit);
