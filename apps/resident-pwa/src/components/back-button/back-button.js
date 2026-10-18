/**
 * @file apps/resident-pwa/src/components/back-button/back-button.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { goBack } from '../../router.js';

export class CnBackButton extends BaseElement {
  connectedCallback() {
    this.render();
  }

  render() {
    clearChildren(this);

    const button = createElement('button', {
      cls: 'cn-back-button__control',
      attrs: { type: 'button', 'aria-label': 'Back' }
    });
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M15 18 9 12l6-6');
    icon.appendChild(path);
    button.appendChild(icon);
    button.addEventListener('click', () => {
      const fallbackParams = Object.fromEntries(
        new URLSearchParams(this.getAttribute('fallback-params') || '').entries()
      );
      goBack(this.getAttribute('fallback') || 'home', fallbackParams);
    });
    this.appendChild(button);
  }
}

customElements.define('cn-back-button', CnBackButton);
