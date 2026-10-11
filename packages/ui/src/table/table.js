/**
 * @file packages/ui/src/table/table.js
 * @description Safe data table component.
 */
import { BaseElement } from '../base-element.js';

export class CnTable extends BaseElement {
  connectedCallback() {
    this.classList.add('cn-table-wrapper');
  }
}

if (!customElements.get('cn-table')) {
  customElements.define('cn-table', CnTable);
}
