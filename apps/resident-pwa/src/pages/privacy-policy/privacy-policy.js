/**
 * @file apps/resident-pwa/src/pages/privacy-policy/privacy-policy.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

const sections = [
  { heading: 'Data we collect', body: 'We collect the contact and address details needed to manage your resident profile, report submissions, and service delivery notifications.' },
  { heading: 'How we use it', body: 'We use your information to route reports to the correct municipality, send updates about service requests, and operate a secure resident account.' },
  { heading: 'Who can see it', body: 'Only the relevant municipality teams and the organisations you report to can see the details needed to act on your reports. Your displayed community badges may be visible to organisations you report to.' },
  { heading: 'Your rights', body: 'You can request a copy of your data, correct inaccurate information, and ask for deletion of your resident profile subject to POPIA retention rules and legal obligations.' },
  { heading: 'Contact us', body: 'Information Officer: POPIA team, privacy@civicneuro.org.' }
];

export class PagePrivacyPolicy extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-legal-page');

    const back = createElement('button', {
      cls: 'cn-legal-back',
      text: '‹ Account',
      attrs: { type: 'button' }
    });
    back.addEventListener('click', () => navigate('account'));

    const title = createElement('h1', { cls: 'cn-legal-title', text: 'Privacy policy' });
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
customElements.define('page-privacy-policy', PagePrivacyPolicy);
