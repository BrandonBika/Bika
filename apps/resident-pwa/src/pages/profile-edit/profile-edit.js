/**
 * @file apps/resident-pwa/src/pages/profile-edit/profile-edit.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

const initialValues = {
  name: 'Kagiso Ndlovu',
  phone: '082 345 6721',
  email: 'kagiso.ndlovu@email.com',
  address: '14 Florida Road, Ward 12'
};

function normalisePhone(value) {
  const digits = value.replace(/\D+/g, '');
  if (digits.length === 10) return `0${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (digits.length === 11 && digits.startsWith('27')) return `+27 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
  return value.trim();
}

export class PageProfileEdit extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-profile-edit-page');

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
        phone: fields.phone.value.trim(),
        email: fields.email.value.trim(),
        address: fields.address.value.trim()
      };
      const hasChanges = Object.entries(values).some(([key, value]) => value !== initialValues[key]);
      const valid = values.name && values.phone && values.address && /\S+@\S+\.\S+/.test(values.email);
      saveBtn.disabled = !(hasChanges && valid);
      saveBtn.classList.toggle('is-disabled', !(hasChanges && valid));
      if (values.phone) {
        const phoneValue = normalisePhone(values.phone);
        if (phoneValue !== values.phone) fields.phone.value = phoneValue;
      }
    };

    Object.values(fields).forEach((input) => input.addEventListener('input', validateForm));

    saveBtn.addEventListener('click', (event) => {
      event.preventDefault();
      if (saveBtn.disabled) return;
      showToast('Profile updated', { type: 'success' });
      navigate('account');
    });

    form.appendChild(note);
    form.appendChild(saveBtn);
    this.appendChild(createElement('h1', { cls: 'cn-profile-title', text: 'Edit profile' }));
    this.appendChild(form);
    validateForm();
  }
}
customElements.define('page-profile-edit', PageProfileEdit);
