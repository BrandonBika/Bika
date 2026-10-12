/**
 * @file apps/resident-pwa/src/pages/sign-in/sign-in.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { continueAsGuest, signIn } from '../../features/auth/auth.client.js';
import { navigate } from '../../router.js';

export class PageSignIn extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');

    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Sign in' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'Welcome back — track your reports in one place' });

    const idInput = createElement('cn-input', {
      attrs: { label: 'Email address', type: 'email', placeholder: 'Email address', autocomplete: 'username', required: 'true' }
    });

    const pwdInput = createElement('cn-input', {
      attrs: { label: 'Password', type: 'password', placeholder: 'Enter your password', autocomplete: 'current-password', required: 'true' }
    });

    const submitBtn = createElement('button', {
      cls: 'cn-btn cn-btn--primary cn-btn--full cn-auth-submit',
      text: 'Sign in',
      attrs: { type: 'button' }
    });

    const forgotBtn = createElement('button', {
      cls: 'cn-auth-forgot',
      text: 'Forgot password?',
      attrs: { type: 'button' }
    });
    forgotBtn.onclick = () => navigate('forgot-password');

    const guestBtn = createElement('button', {
      cls: 'cn-auth-guest',
      text: 'Continue without an account →',
      attrs: { type: 'button' }
    });
    guestBtn.onclick = async () => {
      guestBtn.disabled = true;
      guestBtn.textContent = 'Starting guest session…';
      try {
        await continueAsGuest();
        navigate('guest-report');
      } catch (error) {
        guestBtn.disabled = false;
        guestBtn.textContent = 'Continue without an account →';
        showToast(error.message || 'Could not start a guest session.', { type: 'error' });
      }
    };

    submitBtn.onclick = async () => {
      const idVal = idInput.value;
      const pwdVal = pwdInput.value;
      if (!idVal || !pwdVal) {
        showToast('Please enter both identifier and password', { type: 'error' });
        return;
      }
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';
        await signIn(idVal, pwdVal);
        showToast('Signed in successfully', { type: 'success' });
        navigate('home');
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
        showToast(err.message || 'Invalid credentials', { type: 'error' });
      }
    };

    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(idInput);
    this.appendChild(pwdInput);
    this.appendChild(forgotBtn);
    this.appendChild(submitBtn);
    this.appendChild(guestBtn);
  }
}
customElements.define('page-sign-in', PageSignIn);
