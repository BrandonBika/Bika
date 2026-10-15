/**
 * @file apps/resident-pwa/src/pages/verify-email/verify-email.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { resendVerification } from '../../features/auth/auth.client.js';

export class PageVerifyEmail extends BaseElement {
  init(params) {
    this._email = params.email || '';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');
    this.style.textAlign = 'center';

    const icon = createElement('div', { text: '✉️', attrs: { style: 'font-size: 3rem; margin: 24px 0 16px;' } });
    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Verify Your Email' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'We have sent a confirmation link to your email. Please click it to complete registration before logging in.' });
    const emailInput = createElement('cn-input', {
      attrs: { label: 'Email address', type: 'email', autocomplete: 'email', required: 'true', value: this._email }
    });

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Go to Sign In' });
    btn.onclick = () => navigate('sign-in');
    const resendBtn = createElement('button', {
      cls: 'cn-btn cn-btn--secondary cn-btn--full',
      text: 'Resend verification email',
      attrs: { type: 'button' }
    });
    resendBtn.style.marginTop = '12px';
    resendBtn.onclick = async () => {
      if (!emailInput.value.trim()) {
        showToast('Enter the email address you registered with.', { type: 'error' });
        return;
      }
      try {
        resendBtn.disabled = true;
        await resendVerification(emailInput.value);
        showToast('If the account is awaiting verification, a new link has been sent.', { type: 'info' });
      } catch (error) {
        showToast(error.message || 'Could not resend the verification email.', { type: 'error' });
      } finally {
        resendBtn.disabled = false;
      }
    };

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(emailInput);
    this.appendChild(btn);
    this.appendChild(resendBtn);
  }
}
customElements.define('page-verify-email', PageVerifyEmail);
