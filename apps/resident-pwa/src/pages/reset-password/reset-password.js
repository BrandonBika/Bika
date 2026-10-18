/**
 * @file apps/resident-pwa/src/pages/reset-password/reset-password.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { resetPassword } from '../../features/auth/auth.client.js';
import { navigate } from '../../router.js';
import '../../components/back-button/back-button.js';

export class PageResetPassword extends BaseElement {
  init(params) {
    this._token = params.token || 'mock-reset-token';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'sign-in' } }));

    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Create New Password' });
    const p1 = createElement('cn-input', { attrs: { label: 'New Password', type: 'password', placeholder: 'Min. 8 characters' } });
    const p2 = createElement('cn-input', { attrs: { label: 'Confirm Password', type: 'password', placeholder: 'Re-enter password' } });

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Update Password' });
    btn.style.marginTop = '16px';

    btn.onclick = async () => {
      if (p1.value.length < 8) {
        showToast('Use a password with at least 8 characters.', { type: 'error' });
        return;
      }
      if (p1.value !== p2.value) {
        showToast('Passwords do not match', { type: 'error' });
        return;
      }
      try {
        btn.disabled = true;
        await resetPassword(this._token, p1.value);
        showToast('Password updated! Please sign in.', { type: 'success' });
        navigate('sign-in', {}, { replace: true });
      } catch (error) {
        showToast(error.message || 'Could not update your password.', { type: 'error' });
      } finally {
        btn.disabled = false;
      }
    };

    this.appendChild(title);
    this.appendChild(p1);
    this.appendChild(p2);
    this.appendChild(btn);
  }
}
customElements.define('page-reset-password', PageResetPassword);
