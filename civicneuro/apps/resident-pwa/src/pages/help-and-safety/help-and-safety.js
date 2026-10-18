/**
 * @file apps/resident-pwa/src/pages/help-and-safety/help-and-safety.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/back-button/back-button.js';

export class PageHelpAndSafety extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'menu' } }));
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Help & FAQs' });
    const faqs = [
      { q: 'How is my personal info protected under POPIA?', a: 'CivicNeuro redacts PII, never sells data, stores tokens in memory, and allows one-click data exports.' },
      { q: 'How do I escalate an unresolved issue?', a: 'Open your report in "My Reports" and click "Manual Escalation".' }
    ];

    this.appendChild(h);
    for (const f of faqs) {
      const b = createElement('div');
      b.style.marginBottom = '16px';
      const q = createElement('h3', { text: f.q });
      const a = createElement('p', { text: f.a, attrs: { style: 'color: #5e6c84;' } });
      b.appendChild(q);
      b.appendChild(a);
      this.appendChild(b);
    }
  }
}
customElements.define('page-help-and-safety', PageHelpAndSafety);
