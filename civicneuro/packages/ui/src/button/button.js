/**
 * @file packages/ui/src/button/button.js
 * @description Button component.
 */
import { BaseElement } from '../base-element.js';

export class CnButton extends BaseElement {
  static get observedAttributes() {
    return ['variant', 'disabled', 'type', 'aria-label'];
  }

  connectedCallback() {
    this._upgradeProperty('disabled');
    this.render();
  }

  _upgradeProperty(prop) {
    if (Object.prototype.hasOwnProperty.call(this, prop)) {
      const value = this[prop];
      delete this[prop];
      this[prop] = value;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  render() {
    const variant = this.getAttribute('variant') || 'primary';
    const isFull = this.hasAttribute('full');
    this.classList.add('cn-btn', `cn-btn--${variant}`);
    if (isFull) this.classList.add('cn-btn--full');
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'button');
    }
    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', this.hasAttribute('disabled') ? '-1' : '0');
    }
  }
}

if (!customElements.get('cn-button')) {
  customElements.define('cn-button', CnButton);
}
