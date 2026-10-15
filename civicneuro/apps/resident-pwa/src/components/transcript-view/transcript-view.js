/**
 * @file apps/resident-pwa/src/components/transcript-view/transcript-view.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnTranscriptView extends BaseElement {
  set text(val) {
    const p = this.querySelector('p');
    if (p) p.textContent = val;
  }

  connectedCallback() {
    clearChildren(this);
    this.style.background = '#f4f5f7';
    this.style.padding = '16px';
    this.style.borderRadius = '8px';
    this.style.margin = '16px 0';

    const h = createElement('h4', { text: 'Transcript' });
    const p = createElement('p', { text: this.getAttribute('text') || 'Press and hold the microphone button to dictate.' });

    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('cn-transcript-view', CnTranscriptView);
