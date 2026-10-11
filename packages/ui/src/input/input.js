/**
 * @file packages/ui/src/input/input.js
 * @description Input component.
 */
import { BaseElement } from '../base-element.js';

export class CnInput extends BaseElement {
  static get observedAttributes() {
    return ['type', 'name', 'placeholder', 'disabled', 'required', 'value', 'error', 'label', 'hint'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  get value() {
    const input = this.querySelector('input, textarea');
    return input ? input.value : '';
  }

  set value(val) {
    const input = this.querySelector('input, textarea');
    if (input) input.value = val;
  }

  render() {
    this.clear(this);
    this.classList.add('cn-input-group');

    const labelText = this.getAttribute('label');
    if (labelText) {
      const label = this.create('label', { cls: 'cn-input-label', text: labelText });
      const id = this.getAttribute('id') || `cn-input-${Math.random().toString(36).substring(2, 9)}`;
      this.setAttr(label, 'for', id);
      this.appendChild(label);
    }

    const isTextarea = this.getAttribute('type') === 'textarea';
    const input = this.create(isTextarea ? 'textarea' : 'input', {
      cls: ['cn-input', this.getAttribute('error') ? 'cn-input--error' : '']
    });

    const attrs = ['type', 'name', 'placeholder', 'disabled', 'required', 'value', 'maxlength', 'autocomplete'];
    for (const attr of attrs) {
      if (this.hasAttribute(attr)) {
        this.setAttr(input, attr, this.getAttribute(attr));
      }
    }

    this.appendChild(input);

    const hintText = this.getAttribute('hint');
    if (hintText) {
      const hint = this.create('div', { cls: 'cn-input-hint', text: hintText });
      this.appendChild(hint);
    }

    const errorText = this.getAttribute('error');
    if (errorText) {
      const errorEl = this.create('div', { cls: 'cn-input-error-msg', text: errorText });
      this.setAttr(errorEl, 'role', 'alert');
      this.appendChild(errorEl);
    }
  }
}

if (!customElements.get('cn-input')) {
  customElements.define('cn-input', CnInput);
}
