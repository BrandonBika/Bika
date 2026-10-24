/**
 * @file apps/resident-pwa/src/pages/register/register.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { register } from '../../features/auth/auth.client.js';
import { navigate } from '../../router.js';
import '../../components/back-button/back-button.js';
import '../../components/consent-checkbox/consent-checkbox.js';

export class PageRegister extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'welcome' } }));

    this.classList.add('cn-register-page');

    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Create account' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'Report issues and track them through to resolution' });

    const nameInput = createElement('cn-input', { attrs: { label: 'Full name', autocomplete: 'name', required: 'true' } });
    const emailInput = createElement('cn-input', { attrs: { label: 'Email', type: 'email', autocomplete: 'email', required: 'true' } });
    const phoneInput = createElement('cn-input', { attrs: { label: 'Cellphone number', type: 'tel', autocomplete: 'tel', required: 'true' } });
    const addressInput = createElement('cn-input', { attrs: { label: 'Address', autocomplete: 'street-address', required: 'true' } });
    const pwdInput = createElement('cn-input', { attrs: { label: 'Password', type: 'password', autocomplete: 'new-password', required: 'true' } });
    const confirmPwdInput = createElement('cn-input', { attrs: { label: 'Confirm password', type: 'password', autocomplete: 'new-password', required: 'true' } });

    const consent = createElement('cn-consent-checkbox', {
      attrs: { label: 'I agree to the Terms & Conditions and Privacy Policy, and consent to Bika processing my personal information to submit and track reports.' }
    });

    const updates = createElement('input', {
      cls: 'cn-register-updates-input',
      attrs: { type: 'checkbox', id: 'cn-register-updates' }
    });
    const updatesLabel = createElement('label', {
      cls: 'cn-register-updates-label',
      attrs: { for: 'cn-register-updates' },
      text: 'Send me push notifications and SMS updates about my reports and community activity (optional)'
    });
    const updatesRow = createElement('div', { cls: 'cn-register-updates' });
    updatesRow.append(updates, updatesLabel);

    const submitBtn = createElement('button', {
      cls: 'cn-btn cn-btn--primary cn-btn--full cn-auth-submit',
      text: 'Create account',
      attrs: { type: 'button', disabled: 'true' }
    });

    consent.addEventListener('change', (e) => {
      submitBtn.disabled = !e.detail.checked;
    });

    submitBtn.onclick = async () => {
      const fullName = nameInput.value.trim();
      const email = emailInput.value.trim();
      const phone = phoneInput.value.trim();
      const address = addressInput.value.trim();
      const password = pwdInput.value;

      if (!fullName || !email || !phone || !address || !password || !confirmPwdInput.value) {
        showToast('Complete all required fields', { type: 'error' });
        return;
      }
      if (password !== confirmPwdInput.value) {
        showToast('Passwords do not match', { type: 'error' });
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account…';
        await register({
          fullName,
          phone,
          email,
          address,
          password,
          notificationConsent: updates.checked,
          consentTimestamp: new Date().toISOString()
        });
        showToast('Registration successful! Please verify your email.', { type: 'success' });
        navigate('verify-email', { email }, { replace: true });
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create account';
        showToast(err.message || 'Registration failed', { type: 'error' });
      }
    };

    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(nameInput);
    this.appendChild(emailInput);
    this.appendChild(phoneInput);
    this.appendChild(addressInput);
    this.appendChild(pwdInput);
    this.appendChild(confirmPwdInput);
    this.appendChild(consent);
    this.appendChild(updatesRow);
    this.appendChild(createElement('p', {
      cls: 'cn-register-note',
      text: 'Required to create an account. You can withdraw consent and request deletion of your data from Account.'
    }));
    this.appendChild(submitBtn);
    this.appendChild(createElement('p', {
      cls: 'cn-register-note cn-register-note--verify',
      text: "We'll email a confirmation link — verify it to activate your account."
    }));
  }
}
customElements.define('page-register', PageRegister);
