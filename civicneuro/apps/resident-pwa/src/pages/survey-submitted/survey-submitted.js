/**
 * @file apps/resident-pwa/src/pages/survey-submitted/survey-submitted.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageSurveySubmitted extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '32px 20px';
    this.style.textAlign = 'center';

    const icon = createElement('div', { text: '🎉', attrs: { style: 'font-size: 3rem;' } });
    const h = createElement('h1', { text: 'Survey Completed' });
    const p = createElement('p', { text: 'Thank you for contributing to your community planning.' });
    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Back to Home' });
    btn.onclick = () => navigate('home');

    this.appendChild(icon);
    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(btn);
  }
}
customElements.define('page-survey-submitted', PageSurveySubmitted);
