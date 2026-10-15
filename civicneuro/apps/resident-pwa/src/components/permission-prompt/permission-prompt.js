/**
 * @file apps/resident-pwa/src/components/permission-prompt/permission-prompt.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnPermissionPrompt extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    this.style.textAlign = 'center';

    const icon = createElement('div', { text: '🔐', attrs: { style: 'font-size: 2.5rem; margin-bottom: 12px;' } });
    const title = createElement('h3', { text: this.getAttribute('title') || 'Permission Required' });
    const desc = createElement('p', { text: this.getAttribute('desc') || 'Please grant permission to continue.' });

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(desc);
  }
}
customElements.define('cn-permission-prompt', CnPermissionPrompt);
