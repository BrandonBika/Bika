/**
 * @file tools/build-resident/04-pages-auth.js
 * Generates Auth & Entry pages: welcome, sign-in, register, verify-email, forgot-password, reset-password, session-expired.
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

// 1. welcome
write('apps/resident-pwa/src/pages/welcome/welcome.css', `
.cn-welcome-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 32px 24px;
  min-height: calc(100vh - 120px);
  text-align: center;
}
.cn-welcome-hero {
  margin-top: 40px;
}
.cn-welcome-logo {
  font-size: 3.5rem;
  margin-bottom: 16px;
}
.cn-welcome-title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--cn-color-primary, #0052cc);
  margin-bottom: 8px;
}
.cn-welcome-sub {
  font-size: 1rem;
  color: var(--cn-color-text-muted, #6b778c);
  max-width: 300px;
  line-height: 1.5;
}
.cn-welcome-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 40px;
}
`);

write('apps/resident-pwa/src/pages/welcome/welcome.html', `
<div class="cn-welcome-page">
  <div class="cn-welcome-hero">
    <div class="cn-welcome-logo">🏛️</div>
    <h1 class="cn-welcome-title">CivicNeuro</h1>
    <p class="cn-welcome-sub">Empowering South African communities with fast civic reporting and real-time safety.</p>
  </div>
  <div class="cn-welcome-actions">
    <button class="cn-btn cn-btn--primary cn-btn--full" id="btn-sign-in">Sign In</button>
    <button class="cn-btn cn-btn--secondary cn-btn--full" id="btn-register">Create Resident Account</button>
    <button class="cn-btn cn-btn--ghost cn-btn--full" id="btn-guest">Report as Guest</button>
    <button class="cn-btn cn-btn--ghost cn-btn--full" id="btn-track">Track Existing Report</button>
  </div>
</div>
`);

write('apps/resident-pwa/src/pages/welcome/welcome.js', `/**
 * @file apps/resident-pwa/src/pages/welcome/welcome.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { startGuestSession } from '../../session.js';

export class PageWelcome extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-welcome-page');

    const hero = createElement('div', { cls: 'cn-welcome-hero' });
    const logo = createElement('div', { cls: 'cn-welcome-logo', text: '🏛️' });
    const title = createElement('h1', { cls: 'cn-welcome-title', text: 'CivicNeuro' });
    const sub = createElement('p', { cls: 'cn-welcome-sub', text: 'Empowering South African communities with fast civic reporting and real-time safety.' });

    hero.appendChild(logo);
    hero.appendChild(title);
    hero.appendChild(sub);

    const actions = createElement('div', { cls: 'cn-welcome-actions' });
    const btnSignIn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Sign In' });
    const btnRegister = createElement('button', { cls: 'cn-btn cn-btn--secondary cn-btn--full', text: 'Create Resident Account' });
    const btnGuest = createElement('button', { cls: 'cn-btn cn-btn--ghost cn-btn--full', text: 'Report as Guest' });
    const btnTrack = createElement('button', { cls: 'cn-btn cn-btn--ghost cn-btn--full', text: 'Track Existing Report' });

    btnSignIn.onclick = () => navigate('sign-in');
    btnRegister.onclick = () => navigate('register');
    btnGuest.onclick = () => {
      startGuestSession();
      navigate('guest-report');
    };
    btnTrack.onclick = () => navigate('track-report');

    actions.appendChild(btnSignIn);
    actions.appendChild(btnRegister);
    actions.appendChild(btnGuest);
    actions.appendChild(btnTrack);

    this.appendChild(hero);
    this.appendChild(actions);
  }
}
customElements.define('page-welcome', PageWelcome);
`);

// 2. sign-in
write('apps/resident-pwa/src/pages/sign-in/sign-in.css', `
.cn-auth-page {
  padding: 24px;
}
.cn-auth-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 8px;
}
.cn-auth-sub {
  color: var(--cn-color-text-muted, #6b778c);
  margin-bottom: 24px;
  font-size: 0.9375rem;
}
`);

write('apps/resident-pwa/src/pages/sign-in/sign-in.js', `/**
 * @file apps/resident-pwa/src/pages/sign-in/sign-in.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { signIn } from '../../features/auth/auth.client.js';
import { navigate } from '../../router.js';

export class PageSignIn extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');

    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Sign In' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'Access your civic reports, Lifeline emergency contacts, and Beacon circle.' });

    const idInput = createElement('cn-input', {
      attrs: { label: 'Phone Number or Email', placeholder: 'e.g. 082 123 4567', required: 'true' }
    });

    const pwdInput = createElement('cn-input', {
      attrs: { label: 'Password', type: 'password', placeholder: 'Enter your password', required: 'true' }
    });

    const submitBtn = createElement('button', {
      cls: 'cn-btn cn-btn--primary cn-btn--full',
      text: 'Sign In'
    });
    submitBtn.style.marginTop = '16px';

    const forgotBtn = createElement('button', {
      cls: 'cn-btn cn-btn--ghost cn-btn--full',
      text: 'Forgot password?'
    });
    forgotBtn.onclick = () => navigate('forgot-password');

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
    this.appendChild(submitBtn);
    this.appendChild(forgotBtn);
  }
}
customElements.define('page-sign-in', PageSignIn);
`);

// 3. register
write('apps/resident-pwa/src/pages/register/register.js', `/**
 * @file apps/resident-pwa/src/pages/register/register.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { register } from '../../features/auth/auth.client.js';
import { navigate } from '../../router.js';

export class PageRegister extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');

    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Create Account' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'Join your local ward community to track reports and stay safe.' });

    const nameInput = createElement('cn-input', { attrs: { label: 'Full Name', placeholder: 'e.g. Thabo Ndlovu', required: 'true' } });
    const phoneInput = createElement('cn-input', { attrs: { label: 'Phone Number (SA)', placeholder: '082 123 4567', required: 'true' } });
    const emailInput = createElement('cn-input', { attrs: { label: 'Email Address (Optional)', placeholder: 'name@example.com' } });
    const pwdInput = createElement('cn-input', { attrs: { label: 'Create Password', type: 'password', placeholder: 'Min. 8 characters', required: 'true' } });

    const consent = createElement('cn-consent-checkbox', {
      attrs: { label: 'I agree to the Terms of Service and consent to POPIA personal data processing for civic service delivery.' }
    });

    const submitBtn = createElement('button', {
      cls: 'cn-btn cn-btn--primary cn-btn--full',
      text: 'Create Account',
      attrs: { disabled: 'true' }
    });
    submitBtn.style.marginTop = '16px';

    consent.addEventListener('change', (e) => {
      submitBtn.disabled = !e.detail.checked;
    });

    submitBtn.onclick = async () => {
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account…';
        await register({
          fullName: nameInput.value,
          phone: phoneInput.value,
          email: emailInput.value,
          password: pwdInput.value,
          consentTimestamp: new Date().toISOString()
        });
        showToast('Registration successful! Please verify your email.', { type: 'success' });
        navigate('verify-email');
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
        showToast(err.message || 'Registration failed', { type: 'error' });
      }
    };

    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(nameInput);
    this.appendChild(phoneInput);
    this.appendChild(emailInput);
    this.appendChild(pwdInput);
    this.appendChild(consent);
    this.appendChild(submitBtn);
  }
}
customElements.define('page-register', PageRegister);
`);

// 4. verify-email
write('apps/resident-pwa/src/pages/verify-email/verify-email.js', `/**
 * @file apps/resident-pwa/src/pages/verify-email/verify-email.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageVerifyEmail extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');
    this.style.textAlign = 'center';

    const icon = createElement('div', { text: '✉️', attrs: { style: 'font-size: 3rem; margin: 24px 0 16px;' } });
    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Verify Your Email' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'We have sent a confirmation link to your email. Please click it to complete registration before logging in.' });

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Go to Sign In' });
    btn.onclick = () => navigate('sign-in');

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(btn);
  }
}
customElements.define('page-verify-email', PageVerifyEmail);
`);

// 5. forgot-password & reset-password & session-expired
write('apps/resident-pwa/src/pages/forgot-password/forgot-password.js', `/**
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
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'Enter your registered phone or email to receive reset instructions.' });

    const input = createElement('cn-input', { attrs: { label: 'Phone or Email', placeholder: '082 123 4567' } });
    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Send Reset Link' });
    btn.style.marginTop = '16px';

    btn.onclick = async () => {
      // Account enumeration protection: identical message regardless of existence
      await forgotPassword(input.value);
      showToast('If an account exists, a reset link has been dispatched.', { type: 'info' });
      navigate('sign-in');
    };

    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(input);
    this.appendChild(btn);
  }
}
customElements.define('page-forgot-password', PageForgotPassword);
`);

write('apps/resident-pwa/src/pages/reset-password/reset-password.js', `/**
 * @file apps/resident-pwa/src/pages/reset-password/reset-password.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { resetPassword } from '../../features/auth/auth.client.js';
import { navigate } from '../../router.js';

export class PageResetPassword extends BaseElement {
  init(params) {
    this._token = params.token || 'mock-reset-token';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');

    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Create New Password' });
    const p1 = createElement('cn-input', { attrs: { label: 'New Password', type: 'password', placeholder: 'Min. 8 characters' } });
    const p2 = createElement('cn-input', { attrs: { label: 'Confirm Password', type: 'password', placeholder: 'Re-enter password' } });

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Update Password' });
    btn.style.marginTop = '16px';

    btn.onclick = async () => {
      if (p1.value !== p2.value) {
        showToast('Passwords do not match', { type: 'error' });
        return;
      }
      await resetPassword(this._token, p1.value);
      showToast('Password updated! Please sign in.', { type: 'success' });
      navigate('sign-in');
    };

    this.appendChild(title);
    this.appendChild(p1);
    this.appendChild(p2);
    this.appendChild(btn);
  }
}
customElements.define('page-reset-password', PageResetPassword);
`);

write('apps/resident-pwa/src/pages/session-expired/session-expired.js', `/**
 * @file apps/resident-pwa/src/pages/session-expired/session-expired.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageSessionExpired extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-auth-page');
    this.style.textAlign = 'center';

    const icon = createElement('div', { text: '🔒', attrs: { style: 'font-size: 3rem; margin: 24px 0 16px;' } });
    const title = createElement('h1', { cls: 'cn-auth-title', text: 'Session Expired' });
    const sub = createElement('p', { cls: 'cn-auth-sub', text: 'For your security and POPIA compliance, your session has timed out. Please sign in again.' });

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Sign In Again' });
    btn.onclick = () => navigate('sign-in');

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(sub);
    this.appendChild(btn);
  }
}
customElements.define('page-session-expired', PageSessionExpired);
`);

console.log('Auth and Entry pages generated successfully.');
