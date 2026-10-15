/**
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
