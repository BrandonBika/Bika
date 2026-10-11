/**
 * @file apps/resident-pwa/src/components/voice-input/voice-input.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnVoiceInput extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.alignItems = 'center';
    this.style.margin = '20px 0';

    const btn = createElement('button', {
      cls: 'cn-btn cn-btn--primary',
      text: '🎙️ Hold to Talk',
      attrs: { style: 'width: 80px; height: 80px; border-radius: 40px; font-size: 1rem;' }
    });

    let recording = false;
    btn.onmousedown = btn.ontouchstart = () => {
      recording = true;
      btn.style.backgroundColor = '#de350b';
      this.dispatchEvent(new CustomEvent('record-start'));
    };

    btn.onmouseup = btn.ontouchend = () => {
      if (recording) {
        recording = false;
        btn.style.backgroundColor = '';
        this.dispatchEvent(new CustomEvent('record-stop'));
      }
    };

    const hint = createElement('span', { text: 'Hold button while speaking', attrs: { style: 'font-size: 0.75rem; color: #6b778c; margin-top: 8px;' } });

    this.appendChild(btn);
    this.appendChild(hint);
  }
}
customElements.define('cn-voice-input', CnVoiceInput);
