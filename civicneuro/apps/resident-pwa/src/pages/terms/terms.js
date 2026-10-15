/**
 * @file apps/resident-pwa/src/pages/terms/terms.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

const sections = [
  { heading: 'Using CivicNeuro', body: 'CivicNeuro is a resident service for reporting civic issues and receiving municipal updates in a lawful and respectful way.' },
  { heading: 'Acceptable use', body: 'Do not upload harmful or abusive content, impersonate others, or misuse the service for unlawful activity.' },
  { heading: 'Organisation responses', body: 'Municipal teams may acknowledge, resolve, or escalate reports based on their own policies and operational constraints.' },
  { heading: 'Your account', body: 'You remain responsible for the accuracy of the profile information you provide and for keeping your sign-in details secure.' },
  { heading: 'Changes to these terms', body: 'We may update these terms to reflect operational changes, POPIA requirements, or service improvements.' },
  { heading: 'Governing law', body: 'These terms are governed by South African law and the Protection of Personal Information Act (POPIA).' }
];

export class PageTerms extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-legal-page');

    const back = createElement('button', {
      cls: 'cn-legal-back',
      text: '‹ Account',
      attrs: { type: 'button' }
    });
    back.addEventListener('click', () => navigate('account'));

    const title = createElement('h1', { cls: 'cn-legal-title', text: 'Terms & conditions' });
    const updated = createElement('p', { cls: 'cn-legal-updated', text: 'Last updated 12 August 2026' });

    const content = createElement('div', { cls: 'cn-legal-content' });
    sections.forEach(({ heading, body }) => {
      const h = createElement('h2', { cls: 'cn-legal-section', text: heading });
      const p = createElement('p', { cls: 'cn-legal-body', text: body });
      content.append(h, p);
    });

    this.append(back, title, updated, content);
  }
}
customElements.define('page-terms', PageTerms);
