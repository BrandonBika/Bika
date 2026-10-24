/**
 * @file apps/resident-pwa/src/pages/welcome/welcome.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { continueAsGuest } from '../../features/auth/auth.client.js';
import { sessionStore } from '../../session.js';

export class PageWelcome extends BaseElement {
  connectedCallback() {
    const session = sessionStore.get();
    if (session.isAuthenticated && !session.isGuest) {
      navigate('home', {}, { replace: true });
      return;
    }

    clearChildren(this);
    this.classList.add('cn-welcome-page');

    const hero = createElement('div', { cls: 'cn-welcome-hero' });
    const logo = createElement('div', { cls: 'cn-welcome-logo' });
    const logoImage = document.createElement('img');
    logoImage.src = '/landing/assets/bika-logo.png';
    logoImage.alt = 'Bika logo';
    logoImage.width = 52;
    logoImage.height = 52;
    logo.appendChild(logoImage);
    const title = createElement('h1', { cls: 'cn-welcome-title', text: 'Bika' });
    const sub = createElement('p', { cls: 'cn-welcome-sub', text: 'Report civic issues in your community and track them through to resolution.' });

    hero.appendChild(logo);
    hero.appendChild(title);
    hero.appendChild(sub);

    const actions = createElement('div', { cls: 'cn-welcome-actions' });
    const btnSignIn = createElement('button', { cls: 'cn-welcome-action cn-welcome-signin', text: 'Sign in' });
    const btnRegister = createElement('button', { cls: 'cn-welcome-action cn-welcome-register', text: 'Create account' });
    const btnGuest = createElement('button', { cls: 'cn-welcome-action cn-welcome-guest', text: 'Continue without an account →' });
    const btnTrack = createElement('button', { cls: 'cn-welcome-track', text: 'Already reported as a guest? Track a report' });
    const note = createElement('p', { cls: 'cn-welcome-note', text: "Guest reports have limited tracking — see what's different on the next screen." });

    btnSignIn.onclick = () => navigate('sign-in');
    btnRegister.onclick = () => navigate('register');
    btnGuest.onclick = async () => {
      btnGuest.disabled = true;
      btnGuest.textContent = 'Starting guest session…';
      try {
        await continueAsGuest();
        navigate('guest-report');
      } catch (error) {
        btnGuest.disabled = false;
        btnGuest.textContent = 'Continue without an account →';
        showToast(error.message || 'Could not start a guest session.', { type: 'error' });
      }
    };
    btnTrack.onclick = async () => {
      btnTrack.disabled = true;
      try {
        if (!sessionStore.get()?.isAuthenticated) await continueAsGuest();
        navigate('track-report');
      } catch (error) {
        btnTrack.disabled = false;
        showToast(error.message || 'Could not start a guest session.', { type: 'error' });
      }
    };

    actions.appendChild(btnSignIn);
    actions.appendChild(btnRegister);
    actions.appendChild(btnGuest);
    actions.appendChild(btnTrack);
    actions.appendChild(note);

    this.appendChild(hero);
    this.appendChild(actions);
  }
}
customElements.define('page-welcome', PageWelcome);
