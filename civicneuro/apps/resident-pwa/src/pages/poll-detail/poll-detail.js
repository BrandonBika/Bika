/**
 * @file apps/resident-pwa/src/pages/poll-detail/poll-detail.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { votePoll, getPolls } from '../../features/polls/polls.client.js';

export class PagePollDetail extends BaseElement {
  init(params) {
    this._id = params.id;
  }
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const res = await getPolls();
    const poll = (res.polls || []).find(p => p.id === this._id) || res.polls[0];

    const h = createElement('h1', { text: poll.title });
    const d = createElement('p', { text: poll.description, attrs: { style: 'color: #5e6c84;' } });
    this.appendChild(h);
    this.appendChild(d);

    let selectedOpt = null;
    const optGroup = createElement('div');
    optGroup.style.margin = '20px 0';

    for (const opt of poll.options) {
      const optCard = createElement('div');
      optCard.style.padding = '12px 16px';
      optCard.style.border = '1px solid #dfe1e6';
      optCard.style.borderRadius = '8px';
      optCard.style.marginBottom = '8px';
      optCard.style.cursor = 'pointer';
      optCard.textContent = opt.text;

      optCard.onclick = () => {
        selectedOpt = opt.id;
        Array.from(optGroup.children).forEach(c => c.style.borderColor = '#dfe1e6');
        optCard.style.borderColor = '#0052cc';
        optCard.style.background = '#deebff';
      };
      optGroup.appendChild(optCard);
    }
    this.appendChild(optGroup);

    const voteBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Cast Vote' });
    voteBtn.onclick = async () => {
      if (!selectedOpt) {
        showToast('Please select an option', { type: 'error' });
        return;
      }
      await votePoll(poll.id, selectedOpt);
      showToast('Vote recorded!', { type: 'success' });
      voteBtn.disabled = true;
      voteBtn.textContent = 'Vote Submitted';
    };
    this.appendChild(voteBtn);
  }
}
customElements.define('page-poll-detail', PagePollDetail);
