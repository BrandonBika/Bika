/**
 * @file apps/resident-pwa/src/pages/beacon-add-to-circle/beacon-add-to-circle.js
 * Screen B: Add to your circle.
 * Live resident search, device contacts entry point, results list,
 * pending requests (accept/decline incoming, track outgoing).
 */

import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import {
  getBeaconState,
  searchResidents,
  sendCircleRequest,
  acceptCircleRequest,
  declineCircleRequest,
  subscribeBeacon,
  refreshBeaconCircle,
  subscribeBeaconCircle
} from '../../features/beacon/beacon.client.js';
import { navigate } from '../../router.js';

export class PageBeaconAddToCircle extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-add-page');

    this._query = '';
    this._sentRequests = new Set();
    this._renderGeneration = 0;
    this._unsubscribe = subscribeBeacon(() => {
      if (this.isConnected) this.render();
    });
    this._unsubscribeCircle = subscribeBeaconCircle((error) => {
      console.error('Beacon circle refresh failed:', error);
    });
    this._onOnline = () => {
      refreshBeaconCircle().catch((error) => {
        console.error('Beacon circle reconnect refresh failed:', error);
      });
    };
    window.addEventListener('online', this._onOnline);
    refreshBeaconCircle().catch((error) => {
      console.error('Beacon circle load failed:', error);
    });

    this.render();
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._unsubscribeCircle) this._unsubscribeCircle();
    window.removeEventListener('online', this._onOnline);
    this._renderGeneration += 1;
    super.disconnectedCallback();
  }

  async render() {
    clearChildren(this);
    const state = getBeaconState();

    // 1. Header
    const header = createElement('div', { cls: 'add-header' });
    const backBtn = createElement('button', {
      cls: 'add-back-btn',
      attrs: { type: 'button', 'aria-label': 'Back to Beacon', id: 'add-back-btn' }
    });
    backBtn.appendChild(BeaconIcons.back(13));
    backBtn.onclick = () => navigate('beacon-home');

    const headerText = createElement('div');
    const title = createElement('div', { cls: 'add-title', text: 'Add to your circle' });
    const sub = createElement('div', { cls: 'add-sub', text: 'Find residents or invite a contact' });
    headerText.append(title, sub);
    header.append(backBtn, headerText);
    this.appendChild(header);

    // 2. Search Field
    const searchBox = createElement('div', { cls: 'add-search-box' });
    searchBox.appendChild(BeaconIcons.search(14, 'var(--ink-soft, #3E4A44)'));
    const searchInput = createElement('input', {
      cls: 'add-search-input',
      attrs: {
        type: 'search',
        placeholder: 'Search by name or phone number…',
        value: this._query,
        id: 'add-search-input',
        'aria-label': 'Search residents by name or phone number'
      }
    });

    let debounceTimer;
    searchInput.oninput = (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this._query = e.target.value.trim();
        this.renderResults();
      }, 200);
    };

    searchBox.appendChild(searchInput);
    this.appendChild(searchBox);

    // 3. Find people from contacts button
    const contactsBtn = createElement('button', {
      cls: 'add-contacts-btn',
      attrs: { type: 'button', id: 'add-find-contacts-btn' }
    });
    contactsBtn.appendChild(BeaconIcons.contacts(12, 'var(--ink, #16241F)'));
    contactsBtn.appendChild(createElement('span', { text: 'Choose or add a contact' }));
    contactsBtn.onclick = () => navigate('beacon-find-contacts');
    this.appendChild(contactsBtn);

    // 4. Info note
    const infoNote = createElement('div', { cls: 'add-info-note' });
    infoNote.appendChild(BeaconIcons.info(14, 'var(--teal-deep, #085041)'));
    const infoText = createElement('div', {
      cls: 'add-info-text',
      text: 'Choose a person from your phone contacts or add their name and number now to invite them by SMS.'
    });
    infoNote.appendChild(infoText);
    this.appendChild(infoNote);

    // 5. Results Section Container
    this._resultsContainer = createElement('div', { attrs: { id: 'add-results-section' } });
    this.appendChild(this._resultsContainer);

    // 6. Pending Section
    const pendingList = state.pendingRequests || [];
    if (pendingList.length > 0) {
      const pendingTitle = createElement('div', { cls: 'add-section-title', text: 'Pending' });
      this.appendChild(pendingTitle);

      const pendingContainer = createElement('div');
      for (const req of pendingList) {
        const row = createElement('div', { cls: 'bc-request-row' });
        const avatar = createElement('div', { cls: 'bc-avatar', text: req.initial });
        const textCol = createElement('div', { cls: 'bc-text' });
        const name = createElement('div', { cls: 'bc-name', text: req.name });
        const meta = createElement('div', { cls: 'bc-meta', text: req.meta });
        textCol.append(name, meta);
        row.append(avatar, textCol);

        if (req.direction === 'incoming') {
          const actions = createElement('div', { cls: 'bc-request-actions' });
          const declineBtn = createElement('button', {
            cls: ['bc-pillbtn', 'ghost'],
            attrs: { type: 'button' },
            text: 'Decline'
          });
          declineBtn.onclick = async () => {
            await declineCircleRequest(req.id);
            showToast('Request declined', { type: 'info' });
          };

          const acceptBtn = createElement('button', {
            cls: ['bc-pillbtn', 'primary'],
            attrs: { type: 'button' },
            text: 'Accept'
          });
          acceptBtn.onclick = async () => {
            await acceptCircleRequest(req.id);
            showToast(`${req.name} added to your circle!`, { type: 'success' });
          };

          actions.append(declineBtn, acceptBtn);
          row.appendChild(actions);
        }

        pendingContainer.appendChild(row);
      }
      this.appendChild(pendingContainer);
    }

    // 7. Footer hint
    const footerHint = createElement('div', {
      cls: 'add-footer-hint',
      text: 'Resident directory search is not connected yet. You can still invite someone using their phone contact.'
    });
    this.appendChild(footerHint);

    await this.renderResults();
  }

  async renderResults() {
    if (!this._resultsContainer) return;
    const generation = ++this._renderGeneration;
    clearChildren(this._resultsContainer);

    const state = getBeaconState();
    let results = [];
    if (this._query.length >= 3) {
      try {
        results = await searchResidents(this._query);
      } catch (error) {
        if (generation !== this._renderGeneration) return;
        console.error('Resident search failed:', error);
        showToast(error.message || 'Resident search failed.', { type: 'error' });
      }
    }
    if (generation !== this._renderGeneration || !this.isConnected) return;

    const title = createElement('div', {
      cls: ['add-section-title', 'first'],
      text: `Results · ${results.length}`
    });
    this._resultsContainer.appendChild(title);

    if (results.length === 0) {
      const noResults = createElement('div', {
        cls: 'bc-empty-state',
        attrs: { style: 'padding: 16px 0;' }
      });
      noResults.appendChild(createElement('div', {
        cls: 'bc-empty-desc',
        text: this._query.length < 3
          ? 'Search at least 3 characters for a Bika resident, or choose/add a contact to invite by SMS.'
          : 'No Bika residents were found. You can still invite someone by choosing or adding their contact.'
      }));
      this._resultsContainer.appendChild(noResults);
      return;
    }

    for (const person of results) {
      const row = createElement('div', { cls: 'bc-request-row' });
      const avatar = createElement('div', { cls: 'bc-avatar', text: person.initial });
      const textCol = createElement('div', { cls: 'bc-text' });
      const name = createElement('div', { cls: 'bc-name', text: person.name });
      const meta = createElement('div', { cls: 'bc-meta', text: person.ward || '' });
      textCol.append(name, meta);

      const isMember = (state.members || []).some((member) => member.id === person.id);
      const pendingRequest = (state.pendingRequests || []).find(
        (request) => request.userId === person.id
      );
      const isSent = this._sentRequests.has(person.id) ||
        pendingRequest?.direction === 'outgoing';

      const reqBtn = createElement('button', {
        cls: ['bc-pillbtn', isMember || isSent || pendingRequest ? 'ghost' : 'primary'],
        attrs: { type: 'button' },
        text: isMember
          ? 'In circle'
          : isSent
            ? 'Sent'
            : pendingRequest
              ? 'Respond below'
              : 'Request'
      });
      reqBtn.disabled = isMember || isSent || Boolean(pendingRequest);

      reqBtn.onclick = async () => {
        reqBtn.disabled = true;
        try {
          await sendCircleRequest(person);
          this._sentRequests.add(person.id);
          showToast(`Request sent to ${person.name}`, { type: 'success' });
        } catch (error) {
          console.error('Beacon request failed:', error);
          showToast(error.message || 'Could not send circle request.', { type: 'error' });
          reqBtn.disabled = false;
        }
      };

      row.append(avatar, textCol, reqBtn);
      this._resultsContainer.appendChild(row);
    }
  }
}
customElements.define('page-beacon-add-to-circle', PageBeaconAddToCircle);
