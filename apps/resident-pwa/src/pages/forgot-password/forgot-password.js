/**
 * @file apps/resident-pwa/src/pages/forgot-password/forgot-password.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { forgotPassword } from '../../features/auth/auth.client.js';
import { navigate } from '../../router.js';

export class PageForgotPassword extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');

    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Reset Password' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'Enter the email address on your account to receive a password reset link.' });

    const input = createElement('cn-input', { attrs: { label: 'Email address', type: 'email', autocomplete: 'email', required: 'true' } });
    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Send Reset Link' });
    btn.style.marginTop = '16px';

    btn.onclick = async () => {
      try {
        await forgotPassword(input.value);
        showToast('If an account exists, a reset link has been dispatched.', { type: 'info' });
        navigate('sign-in');
      } catch (error) {
        showToast(error.message || 'Could not send password reset instructions.', { type: 'error' });
      }
    };

    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(input);
    this.appendChild(btn);
  }
}
customElements.define('page-forgot-password', PageForgotPassword);
