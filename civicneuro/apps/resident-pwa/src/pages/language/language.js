/**
 * @file apps/resident-pwa/src/pages/language/language.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { availableLanguages, switchLanguage, getCurrentLanguage } from '../../features/i18n/language.js';
import { navigate } from '../../router.js';

export class PageLanguage extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-language-page');

    const initialCode = getCurrentLanguage();
    let selectedCode = initialCode;

    this.appendChild(createElement('h1', { cls: 'cn-language-title', text: 'Language' }));
    this.appendChild(createElement('p', { cls: 'cn-language-sub', text: 'Choose the language used across the app' }));

    const list = createElement('div', { cls: 'cn-language-card' });
    const choices = [];
    const availabilityNote = createElement('p', {
      cls: 'cn-language-availability',
      attrs: { role: 'status', 'aria-live': 'polite' }
    });
    const showTranslationAvailability = (code) => {
      const language = availableLanguages.find((item) => item.code === code);
      availabilityNote.textContent = language?.hasTranslations
        ? 'App text is shown in English.'
        : `App text is currently in English. ${language?.name || 'This language'} translations are not available yet.`;
    };
    showTranslationAvailability(selectedCode);

    availableLanguages.forEach((lang) => {
      const row = createElement('button', {
        cls: ['cn-language-row', selectedCode === lang.code ? 'selected' : ''],
        attrs: {
          type: 'button',
          'aria-pressed': String(selectedCode === lang.code)
        }
      });

      const textWrap = createElement('span', { cls: 'cn-language-text' });
      textWrap.append(
        createElement('span', { cls: 'cn-language-name', text: lang.name }),
        createElement('span', { cls: 'cn-language-native', text: lang.nativeName })
      );
      const radio = createElement('span', { cls: 'cn-language-radio', attrs: { 'aria-hidden': 'true' } });
      row.append(textWrap, radio);
      row.addEventListener('click', () => {
        selectedCode = lang.code;
        showTranslationAvailability(selectedCode);
        choices.forEach((choice) => {
          const isSelected = choice.dataset.code === selectedCode;
          choice.classList.toggle('selected', isSelected);
          choice.setAttribute('aria-pressed', String(isSelected));
        });
        saveBtn.disabled = false;
        saveBtn.classList.remove('is-disabled');
      });
      row.dataset.code = lang.code;
      choices.push(row);
      list.appendChild(row);
    });

    const saveBtn = createElement('button', {
      cls: 'cn-language-save is-disabled',
      text: 'Save',
      attrs: { type: 'button', disabled: 'disabled' }
    });

    saveBtn.addEventListener('click', () => {
      switchLanguage(selectedCode);
      const language = availableLanguages.find((lang) => lang.code === selectedCode);
      showToast(
        language?.hasTranslations
          ? `Language set to ${language.name}.`
          : `Language set to ${language?.name || 'English'}. App text remains in English until translations are available.`,
        { type: language?.hasTranslations ? 'success' : 'warning' }
      );
      navigate('account');
    });

    this.append(list, availabilityNote);
    this.appendChild(saveBtn);
  }
}
customElements.define('page-language', PageLanguage);
