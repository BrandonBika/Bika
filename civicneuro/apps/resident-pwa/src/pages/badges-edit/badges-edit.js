/**
 * @file apps/resident-pwa/src/pages/badges-edit/badges-edit.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { goBack } from '../../router.js';
import '../../components/back-button/back-button.js';

const badgeDefinitions = [
  { id: 'neighbourhood-watch', title: 'Neighbourhood Watch', description: 'Consistently reports local problems' },
  { id: 'water-watcher', title: 'Water Watcher', description: 'Reports water-related issues' },
  { id: 'green-citizen', title: 'Green Citizen', description: 'Reports environmental issues' },
  { id: 'community-voice', title: 'Community Voice', description: 'Participates in polls and surveys' },
  { id: 'community-helper', title: 'Community Helper', description: 'Confirms other residents\' useful reports' },
  { id: 'spotter', title: 'Spotter', description: 'Identifies recurring problems' }
];

const selectedDefault = new Set(['neighbourhood-watch', 'water-watcher', 'spotter']);

export class PageBadgesEdit extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-badges-page');
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'account' } }));

    const title = createElement('h1', { cls: 'cn-badges-title', text: 'Community badges' });
    const sub = createElement('p', { cls: 'cn-badges-subtitle', text: 'Pick the badges that reflect how you contribute. These are shown on your profile and visible to organisations you report to.' });
    const note = createElement('div', { cls: 'cn-badges-note' });
    note.append(
      createElement('span', { cls: 'cn-badges-note__icon', text: 'i', attrs: { 'aria-hidden': 'true' } }),
      createElement('span', { cls: 'cn-badges-note__text', text: 'Badges are earned from your activity, but you choose which ones to display.' })
    );

    const list = createElement('div', { cls: 'cn-badges-list' });
    const selected = new Set(selectedDefault);

    badgeDefinitions.forEach(({ id, title: badgeTitle, description }) => {
      const card = createElement('button', {
        cls: ['cn-badge-card', selected.has(id) ? 'selected' : ''],
        attrs: { type: 'button' }
      });

      const icon = createElement('span', { cls: 'cn-badge-card__icon', text: badgeTitle.slice(0, 1), attrs: { 'aria-hidden': 'true' } });
      const body = createElement('span', { cls: 'cn-badge-card__body' });
      body.append(
        createElement('span', { cls: 'cn-badge-card__title', text: badgeTitle }),
        createElement('span', { cls: 'cn-badge-card__desc', text: description })
      );
      const check = createElement('span', { cls: 'cn-badge-card__check', attrs: { 'aria-hidden': 'true' } });
      card.append(icon, body, check);

      card.addEventListener('click', () => {
        if (!selected.has(id) && selected.size >= 3) {
          showToast('Maximum of 3 badges selected', { type: 'warning' });
          return;
        }
        if (selected.has(id)) {
          selected.delete(id);
          card.classList.remove('selected');
        } else {
          selected.add(id);
          card.classList.add('selected');
        }
      });

      list.appendChild(card);
    });

    const saveBtn = createElement('button', {
      cls: 'cn-badges-save',
      text: 'Save badges',
      attrs: { type: 'button' }
    });

    saveBtn.addEventListener('click', () => {
      showToast('Badges saved', { type: 'success' });
      goBack('account');
    });

    this.append(title, sub, note, list, saveBtn);
  }
}
customElements.define('page-badges-edit', PageBadgesEdit);
