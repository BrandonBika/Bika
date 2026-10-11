/**
 * @file apps/resident-pwa/src/pages/polls/polls.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getPolls } from '../../features/polls/polls.client.js';
import { navigate } from '../../router.js';

export class PagePolls extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Community Polls' });
    this.appendChild(h);

    const res = await getPolls();
    for (const poll of (res.polls || [])) {
      const card = createElement('div');
      card.style.background = '#fff';
      card.style.border = '1px solid #dfe1e6';
      card.style.borderRadius = '12px';
      card.style.padding = '16px';
      card.style.marginBottom = '12px';
      card.style.cursor = 'pointer';

      const t = createElement('div', { text: poll.title, attrs: { style: 'font-weight: 700; font-size: 1.125rem;' } });
      const d = createElement('p', { text: poll.description, attrs: { style: 'font-size: 0.875rem; color: #5e6c84;' } });
      const v = createElement('div', { text: `${poll.totalVotes} votes cast`, attrs: { style: 'font-size: 0.75rem; color: #0052cc; font-weight: 600;' } });

      card.appendChild(t);
      card.appendChild(d);
      card.appendChild(v);
      card.onclick = () => navigate('poll-detail', { id: poll.id });
      this.appendChild(card);
    }
  }
}
customElements.define('page-polls', PagePolls);
