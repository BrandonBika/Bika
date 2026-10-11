/**
 * @file apps/resident-pwa/src/pages/survey/survey.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getSurveys, submitSurvey } from '../../features/surveys/surveys.client.js';
import { navigate } from '../../router.js';

export class PageSurvey extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const res = await getSurveys();
    const surv = (res.surveys || [])[0];

    const h = createElement('h1', { text: surv.title });
    const d = createElement('p', { text: surv.description, attrs: { style: 'color: #5e6c84;' } });
    this.appendChild(h);
    this.appendChild(d);

    const submitBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Submit Survey Answers' });
    submitBtn.style.marginTop = '24px';
    submitBtn.onclick = async () => {
      await submitSurvey(surv.id, [{ q1: 'Daily' }]);
      showToast('Survey submitted!', { type: 'success' });
      navigate('survey-submitted');
    };
    this.appendChild(submitBtn);
  }
}
customElements.define('page-survey', PageSurvey);
