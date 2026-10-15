/**
 * @file apps/resident-pwa/src/pages/lifeline-home/lifeline-home.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getLifelineCards, LIFELINE_STARTER_CARDS } from '../../features/lifeline/lifeline.client.js';
import { navigate } from '../../router.js';
import '../../components/lifeline-card/lifeline-card.js';

export class PageLifelineHome extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-lifeline-page');

    const header = createElement('div', { cls: 'cn-lifeline-page-heading' });

    const title = createElement('h1', { cls: 'cn-lifeline-page-title', text: 'Lifeline' });
    const addBtn = createElement('button', {
      cls: 'cn-lifeline-create',
      text: '+ Add group',
      attrs: { type: 'button' }
    });
    addBtn.onclick = () => navigate('lifeline-card-create');
    header.appendChild(title);
    header.appendChild(addBtn);
    this.appendChild(header);

    const desc = createElement('p', {
      cls: 'cn-lifeline-intro',
      text: 'Tap a group to call everyone in it. Each group can include up to 4 people.'
    });
    this.appendChild(desc);

    const starterTitle = createElement('h2', { cls: 'cn-lifeline-section-title', text: 'Quick call examples' });
    const starterCards = createElement('div', { cls: 'cn-lifeline-grid' });
    for (const card of LIFELINE_STARTER_CARDS) {
      const element = createElement('cn-lifeline-card');
      element.data = card;
      starterCards.appendChild(element);
    }
    this.append(starterTitle, starterCards);

    const sectionTitle = createElement('h2', { cls: 'cn-lifeline-section-title', text: 'Your own cards' });
    const cards = createElement('div', { cls: 'cn-lifeline-grid' });
    this.append(sectionTitle, cards);
    try {
      const result = await getLifelineCards();
      for (const card of (result.cards || []).filter((entry) => !entry.isPreset)) {
        const element = createElement('cn-lifeline-card');
        element.data = card;
        cards.appendChild(element);
      }
      if (!cards.childElementCount) {
        this.appendChild(createElement('p', {
          cls: 'cn-lifeline-intro',
          text: 'No personal cards yet. Use the examples above for ideas, then add your own group.'
        }));
      }
    } catch (error) {
      this.appendChild(createElement('p', {
        cls: 'cn-lifeline-intro',
        attrs: { role: 'alert' },
        text: `Could not load your saved cards: ${error.message}`
      }));
    }
  }
}
customElements.define('page-lifeline-home', PageLifelineHome);
