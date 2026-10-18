/**
 * @file apps/resident-pwa/src/pages/news-article/news-article.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getNews } from '../../features/news/news.client.js';
import '../../components/back-button/back-button.js';

export class PageNewsArticle extends BaseElement {
  init(params) {
    this._id = params.id;
  }
  async connectedCallback() {
    clearChildren(this);
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'news' } }));
    this.style.padding = '20px';

    const res = await getNews();
    const item = (res.news || []).find(n => n.id === this._id) || res.news[0];

    const h = createElement('h1', { text: item.title });
    const p = createElement('p', { text: item.body || item.snippet, attrs: { style: 'line-height: 1.6;' } });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-news-article', PageNewsArticle);
