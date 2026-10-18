/**
 * @file apps/resident-pwa/src/pages/language/language.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { availableLanguages, switchLanguage, getCurrentLanguage } from '../../features/i18n/language.js';
import { goBack } from '../../router.js';
import '../../components/back-button/back-button.js';

export class PageLanguage extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-language-page');

    const initialCode = getCurrentLanguage();
    let selectedCode = initialCode;

    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'menu' } }));
    this.appendChild(createElement('h1', { cls: 'cn-language-title', text: 'Language' }));
    this.appendChild(createElement('p', { cls: 'cn-language-sub', text: 'Choose the language used across the app' }));

    const list = createElement('div', { cls: 'cn-language-card' });
    const choices = [];

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
      showToast(`Language set to ${availableLanguages.find((lang) => lang.code === selectedCode)?.name || 'English'}`, { type: 'success' });
      goBack('account');
    });

    this.appendChild(list);
    this.appendChild(saveBtn);
  }
}
customElements.define('page-language', PageLanguage);
