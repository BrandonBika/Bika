/**
 * @file apps/resident-pwa/src/components/camera-capture/camera-capture.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnCameraCapture extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    const box = createElement('div');
    box.style.border = '2px dashed #dfe1e6';
    box.style.borderRadius = '8px';
    box.style.padding = '24px';
    box.style.textAlign = 'center';

    const input = createElement('input', {
      attrs: {
        type: 'file',
        accept: 'image/*',
        capture: 'environment',
        'aria-label': 'Take or choose a photo'
      }
    });
    input.hidden = true;
    this._input = input;
    const btn = createElement('button', { cls: 'cn-btn cn-btn--secondary', text: '📷 Take or Upload Photo' });
    btn.onclick = () => this.open();

    input.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        this.dispatchEvent(new CustomEvent('photo-selected', { detail: { file: e.target.files[0] } }));
      }
      input.value = '';
    };

    box.appendChild(input);
    box.appendChild(btn);
    this.appendChild(box);
  }

  open() {
    if (!this._input) {
      throw new Error('Camera capture is not ready');
    }
    this._input.click();
  }
}
customElements.define('cn-camera-capture', CnCameraCapture);
