/**
 * @file apps/resident-pwa/src/components/bottom-sheet/bottom-sheet.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnBottomSheet extends BaseElement {
  connectedCallback() {
    this.classList.add('cn-sheet-backdrop');
  }
}
customElements.define('cn-bottom-sheet', CnBottomSheet);
