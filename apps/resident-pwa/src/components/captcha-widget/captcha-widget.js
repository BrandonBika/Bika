/**
 * @file apps/resident-pwa/src/components/captcha-widget/captcha-widget.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnCaptchaWidget extends BaseElement {
  get token() {
    return 'mock-captcha-verified-token-' + Date.now();
  }

  connectedCallback() {
    clearChildren(this);
    this.style.margin = '16px 0';
    this.style.padding = '12px';
    this.style.background = '#f4f5f7';
    this.style.borderRadius = '8px';
    this.style.border = '1px solid #dfe1e6';
    this.style.display = 'flex';
    this.style.alignItems = 'center';
    this.style.gap = '8px';

    const check = createElement('input', { attrs: { type: 'checkbox', checked: 'true', disabled: 'true' } });
    const label = createElement('span', { text: '🛡️ Protected by hCaptcha (Verified)' });
    this.appendChild(check);
    this.appendChild(label);
  }
}
customElements.define('cn-captcha-widget', CnCaptchaWidget);
