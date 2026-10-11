/**
 * @file apps/resident-pwa/src/pages/news/news.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getNews } from '../../features/news/news.client.js';
import { navigate } from '../../router.js';

export class PageNews extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Municipal News & Bulletins' });
    this.appendChild(h);

    const res = await getNews();
    for (const item of (res.news || [])) {
      const card = createElement('div');
      card.style.background = '#fff';
      card.style.border = '1px solid #dfe1e6';
      card.style.borderRadius = '8px';
      card.style.padding = '16px';
      card.style.marginBottom = '12px';
      card.style.cursor = 'pointer';

      const t = createElement('div', { text: item.title, attrs: { style: 'font-weight: 700;' } });
      const s = createElement('p', { text: item.snippet, attrs: { style: 'font-size: 0.875rem; color: #5e6c84;' } });
      card.appendChild(t);
      card.appendChild(s);
      card.onclick = () => navigate('news-article', { id: item.id });
      this.appendChild(card);
    }
  }
}
customElements.define('page-news', PageNews);
