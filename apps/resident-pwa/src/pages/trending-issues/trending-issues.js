/**
 * @file apps/resident-pwa/src/pages/trending-issues/trending-issues.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageTrendingIssues extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Trending Issues' });
    const p = createElement('p', { text: 'Most reported concerns in your municipal zone this week.' });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-trending-issues', PageTrendingIssues);
