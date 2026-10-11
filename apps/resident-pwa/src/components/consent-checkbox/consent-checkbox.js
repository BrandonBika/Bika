/**
 * @file apps/resident-pwa/src/components/consent-checkbox/consent-checkbox.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnConsentCheckbox extends BaseElement {
  get checked() {
    const input = this.querySelector('input');
    return input ? input.checked : false;
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-consent-group');

    const input = createElement('input', {
      cls: 'cn-consent-checkbox',
      attrs: { type: 'checkbox', id: 'cn-popia-consent' }
    });
    input.onchange = (event) => {
      event.stopPropagation();
      this.dispatchEvent(new CustomEvent('change', {
        detail: { checked: input.checked },
        bubbles: true
      }));
    };

    const label = createElement('label', {
      cls: 'cn-consent-label',
      attrs: { for: 'cn-popia-consent' },
      text: this.getAttribute('label') || 'I consent to the processing of my personal info in terms of POPIA.'
    });

    this.appendChild(input);
    this.appendChild(label);
  }
}
customElements.define('cn-consent-checkbox', CnConsentCheckbox);
