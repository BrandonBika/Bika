/**
 * @file apps/resident-pwa/src/pages/beacon-requests/beacon-requests.js
 * Pending Beacon circle requests, with accept/decline and awaiting state.
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import {
  acceptCircleRequest,
  declineCircleRequest,
  getBeaconState,
  subscribeBeacon
} from '../../features/beacon/beacon.client.js';
import { navigate } from '../../router.js';

export class PageBeaconRequests extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-requests-page');

    this._unsubscribe = subscribeBeacon(() => {
      if (this.isConnected) this.render();
    });

    this.render();
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    super.disconnectedCallback();
  }

  render() {
    clearChildren(this);
    const state = getBeaconState();
    const requests = state.pendingRequests || [];

    const header = createElement('div', { cls: 'requests-header' });
    const backBtn = createElement('button', {
      cls: 'requests-back-btn',
      attrs: { type: 'button', 'aria-label': 'Back to Beacon', id: 'requests-back-btn' }
    });
    backBtn.appendChild(BeaconIcons.back(13));
    backBtn.onclick = () => navigate('beacon-home');

    const headerText = createElement('div');
    const title = createElement('div', { cls: 'requests-title', text: 'Circle requests' });
    const sub = createElement('div', {
      cls: 'requests-sub',
      text: requests.length ? `${requests.length} pending` : 'No pending requests'
    });
    headerText.append(title, sub);
    header.append(backBtn, headerText);
    this.appendChild(header);

    if (requests.length === 0) {
      const empty = createElement('div', { cls: 'requests-empty' });
      empty.appendChild(createElement('div', {
        cls: 'requests-empty-title',
        text: 'No circle requests right now'
      }));
      empty.appendChild(createElement('div', {
        cls: 'requests-empty-copy',
        text: 'When someone wants to add you to their circle, it will appear here.'
      }));
      this.appendChild(empty);
      return;
    }

    const incoming = requests.filter((r) => r.direction === 'incoming');
    const outgoing = requests.filter((r) => r.direction === 'outgoing');

    if (incoming.length > 0) {
      const section = createElement('div', { cls: 'requests-section', text: 'Incoming' });
      this.appendChild(section);

      const list = createElement('div');
      for (const req of incoming) {
        const row = createElement('div', { cls: 'request-row' });
        const avatar = createElement('div', { cls: 'request-avatar', text: req.initial });
        const textCol = createElement('div', { cls: 'request-text' });
        const name = createElement('div', { cls: 'request-name', text: req.name });
        const meta = createElement('div', { cls: 'request-meta', text: req.meta || 'Wants to share with you' });
        textCol.append(name, meta);
        row.append(avatar, textCol);

        const actions = createElement('div', { cls: 'request-actions' });
        const declineBtn = createElement('button', {
          cls: ['request-pill', 'request-pill--ghost'],
          attrs: { type: 'button' },
          text: 'Decline'
        });
        declineBtn.onclick = async () => {
          await declineCircleRequest(req.id);
          showToast('Request declined', { type: 'info' });
        };

        const acceptBtn = createElement('button', {
          cls: ['request-pill', 'request-pill--primary'],
          attrs: { type: 'button' },
          text: 'Accept'
        });
        acceptBtn.onclick = async () => {
          await acceptCircleRequest(req.id);
          showToast(`${req.name} added to your circle!`, { type: 'success' });
        };

        actions.append(declineBtn, acceptBtn);
        row.appendChild(actions);
        list.appendChild(row);
      }
      this.appendChild(list);
    }

    if (outgoing.length > 0) {
      const section = createElement('div', { cls: ['requests-section', 'requests-section--spaced'], text: 'Awaiting response' });
      this.appendChild(section);

      const list = createElement('div');
      for (const req of outgoing) {
        const row = createElement('div', { cls: 'request-row' });
        const avatar = createElement('div', { cls: 'request-avatar', text: req.initial });
        const textCol = createElement('div', { cls: 'request-text' });
        const name = createElement('div', { cls: 'request-name', text: req.name });
        const meta = createElement('div', {
          cls: 'request-meta',
          text: req.meta || 'Request sent · awaiting accept'
        });
        textCol.append(name, meta);
        row.append(avatar, textCol);
        list.appendChild(row);
      }
      this.appendChild(list);
    }
  }
}

customElements.define('page-beacon-requests', PageBeaconRequests);
