/**
 * @file packages/ui/src/modal/modal.js
 * @description Accessible dialog/modal Web Component.
 */
import { BaseElement } from '../base-element.js';

export class CnModal extends BaseElement {
  static get observedAttributes() {
    return ['open', 'title'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  open() {
    this.setAttribute('open', '');
  }

  close() {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('close', { bubbles: true }));
  }

  render() {
    this.classList.add('cn-modal-backdrop');
    if (this.hasAttribute('open')) {
      this.setAttribute('aria-hidden', 'false');
    } else {
      this.setAttribute('aria-hidden', 'true');
    }
  }
}

if (!customElements.get('cn-modal')) {
  customElements.define('cn-modal', CnModal);
}
