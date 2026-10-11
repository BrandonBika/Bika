/**
 * @file apps/resident-pwa/src/pages/beacon-start-confirm/beacon-start-confirm.js
 * Screen A4: Start sharing confirm.
 * Safe DOM rendering, member selection, duration chips, off-path alert toggle, session activation.
 */

import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement, setText } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import {
  clearPendingBeaconPath,
  getPendingBeaconPath,
  getBeaconState,
  startActiveSession
} from '../../features/beacon/beacon.client.js';
import {
  BEACON_MAX_REDUCED_ACCURACY_METERS,
  getLocationErrorMessage,
  getBeaconStartDecision,
  isValidBeaconRouteStart,
  requestCurrentLocation
} from '../../features/beacon/beacon-location.js';
import {
  createBeaconDivIcon,
  createBeaconMap,
  L
} from '../../features/beacon/leaflet-map.js';
import { navigate } from '../../router.js';

export class PageBeaconStartConfirm extends BaseElement {
  init(params) {
    this._params = params || {};
    this._mode = this._params.mode === 'live' ? 'live' : 'path';
    this._destination = this._params.destination || 'Musgrave Centre';
    this._distance = this._params.distance || '1.4 km';
    this._time = this._params.time || '18 min';
    this._preselectedMember = this._params.memberId || null;
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-confirm-page');
    this._isOnline = navigator.onLine;
    this._onConnectionChange = () => {
      this._isOnline = navigator.onLine;
      this.updateStartAvailability();
    };
    window.addEventListener('online', this._onConnectionChange);
    window.addEventListener('offline', this._onConnectionChange);

    const state = getBeaconState();
    const members = state.members || [];
    this._routeCoordinates = this._mode === 'path' ? getPendingBeaconPath() : null;

    this._selectedMemberIds = new Set();
    if (this._preselectedMember && members.some((member) => member.id === this._preselectedMember)) {
      this._selectedMemberIds.add(this._preselectedMember);
    }

    this._duration = this._mode === 'path' ? 'Until I arrive' : 'Until I stop';
    this._offPathAlert = true;
    this._locationStatusMessage = '';
    this._locationRetryInProgress = false;
    this._startingSession = false;

    this.render();
  }

  disconnectedCallback() {
    window.removeEventListener('online', this._onConnectionChange);
    window.removeEventListener('offline', this._onConnectionChange);
    this._map?.remove();
    this._map = null;
    super.disconnectedCallback();
  }

  render() {
    this._map?.remove();
    this._map = null;
    clearChildren(this);
    const state = getBeaconState();
    const members = state.members || [];

    // 1. Header
    const header = createElement('div', { cls: 'cf-header' });
    const backBtn = createElement('button', {
      cls: 'cf-back-btn',
      attrs: { type: 'button', 'aria-label': 'Go back', id: 'cf-back-btn' }
    });
    backBtn.appendChild(BeaconIcons.back(13));
    backBtn.onclick = () => {
      if (this._mode === 'path') navigate('beacon-draw-path');
      // Live variant: back → A2 Share Mode Chooser
      else navigate('beacon-home', { mode: 'choose' });
    };

    const headerText = createElement('div');
    const title = createElement('div', { cls: 'cf-title', text: 'Start sharing' });
    const sub = createElement('div', {
      cls: 'cf-sub',
      text: this._mode === 'path' ? `Walk to ${this._destination} · ${this._distance}` : 'Live location'
    });
    headerText.append(title, sub);
    header.append(backBtn, headerText);
    this.appendChild(header);

    // 2. Route preview (for drawn path variant only)
    if (this._mode === 'path') {
      const preview = createElement('div', { cls: 'cf-route-preview' });
      const miniMap = createElement('div', {
        cls: 'cf-route-map',
        attrs: { 'aria-label': 'OpenStreetMap route preview' }
      });
      preview.appendChild(miniMap);

      const badge = createElement('div', {
        cls: 'cf-route-badge',
        text: `~${this._time} · ETA 6:52 PM`
      });

      preview.appendChild(badge);
      this.appendChild(preview);
      const route = this._routeCoordinates;
      if (route?.length > 1) {
        this._map = createBeaconMap(miniMap, { interactive: false, zoom: 15 });
        L.polyline(route, {
          color: '#1C8C99',
          opacity: 0.16,
          weight: 24,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false
        }).addTo(this._map);
        L.polyline(route, {
          color: '#1C8C99',
          weight: 3,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false
        }).addTo(this._map);
        L.marker(route[0], {
          icon: createBeaconDivIcon('Y', 'self'),
          title: 'Your starting location'
        }).addTo(this._map);
        L.marker(route[route.length - 1], {
          icon: createBeaconDivIcon('D', 'destination'),
          title: this._destination
        }).addTo(this._map);
        this._map.fitBounds(route, { padding: [10, 10], maxZoom: 15 });
        this._map.invalidateSize();
      }
    }

    // 3. SHARE WITH Section
    const shareWithHead = createElement('div', { cls: 'cf-section-label' });
    const shareWithLabel = createElement('span', { text: 'Share with' });
    const selectAllBtn = createElement('button', {
      cls: 'cf-select-all-btn',
      attrs: { type: 'button', id: 'cf-select-all-btn' },
      text: members.length > 0 && this._selectedMemberIds.size === members.length
        ? 'Deselect all'
        : 'Select all'
    });
    selectAllBtn.onclick = () => {
      if (this._selectedMemberIds.size === members.length) {
        this._selectedMemberIds.clear();
      } else {
        for (const m of members) this._selectedMemberIds.add(m.id);
      }
      this.render();
    };
    shareWithHead.append(shareWithLabel, selectAllBtn);
    this.appendChild(shareWithHead);

    const memberList = createElement('div', { cls: 'cf-member-list' });
    if (members.length === 0) {
      const emptyMembers = createElement('div', {
        cls: 'cf-empty-members',
        text: 'Your circle is empty. Add someone before starting a share.'
      });
      const addMembers = createElement('button', {
        cls: 'cf-location-retry',
        attrs: { type: 'button' },
        text: 'Choose or add a contact'
      });
      addMembers.onclick = () => navigate('beacon-add-to-circle');
      memberList.append(emptyMembers, addMembers);
    }
    for (const member of members) {
      const isSelected = this._selectedMemberIds.has(member.id);
      const row = createElement('button', {
        cls: 'cf-member-row',
        attrs: {
          type: 'button',
          role: 'checkbox',
          'aria-checked': isSelected ? 'true' : 'false',
          'aria-label': `Share your location with ${member.name}`
        }
      });

      const avatar = createElement('div', { cls: 'cf-member-avatar', text: member.initial });
      const info = createElement('div', { cls: 'cf-member-info' });
      const name = createElement('div', { cls: 'cf-member-name', text: member.name });
      const meta = createElement('div', { cls: 'cf-member-meta', text: 'In your circle' });
      info.append(name, meta);

      const check = createElement('div', { cls: ['cf-check-circle', isSelected ? 'on' : ''] });
      if (isSelected) {
        check.appendChild(BeaconIcons.check(12, '#FFFFFF', 3));
      }

      row.onclick = () => {
        if (this._selectedMemberIds.has(member.id)) {
          this._selectedMemberIds.delete(member.id);
        } else {
          this._selectedMemberIds.add(member.id);
        }
        this.render();
      };

      row.append(avatar, info, check);
      memberList.appendChild(row);
    }
    this.appendChild(memberList);

    // 4. HOW LONG Section
    const howLongHead = createElement('div', { cls: 'cf-section-label' });
    howLongHead.appendChild(createElement('span', { text: 'How long' }));
    this.appendChild(howLongHead);

    const durationRow = createElement('div', { cls: 'cf-duration-row' });
    const firstOption = this._mode === 'path' ? 'Until I arrive' : 'Until I stop';
    const durationOptions = [firstOption, '30 min', '1 hour', '2 hours'];

    for (const opt of durationOptions) {
      const chip = createElement('button', {
        cls: ['cf-chip', this._duration === opt ? 'on' : ''],
        attrs: { type: 'button' },
        text: opt
      });
      chip.onclick = () => {
        this._duration = opt;
        this.render();
      };
      durationRow.appendChild(chip);
    }
    this.appendChild(durationRow);

    // 5. Off-path alert row (drawn path variant only)
    if (this._mode === 'path') {
      const alertRow = createElement('div', { cls: 'cf-alert-row' });
      const alertIc = createElement('div', { cls: 'cf-alert-ic' });
      alertIc.appendChild(BeaconIcons.warning(15, 'var(--amber, #BA7517)'));

      const alertText = createElement('div', { attrs: { style: 'flex: 1;' } });
      const alertTitle = createElement('div', { cls: 'cf-alert-title', text: 'Alert them if I stray off my path' });
      const alertDesc = createElement('div', {
        cls: 'cf-alert-desc',
        text: 'Notified if you move more than 100 m from the line.'
      });
      alertText.append(alertTitle, alertDesc);

      const toggle = createElement('button', {
        cls: ['cf-toggle', this._offPathAlert ? '' : 'off'],
        attrs: {
          type: 'button',
          role: 'switch',
          'aria-checked': this._offPathAlert ? 'true' : 'false',
          'aria-label': 'Alert selected members if I stray off my path',
          id: 'cf-offpath-toggle'
        }
      });
      const knob = createElement('div', { cls: 'cf-toggle-knob' });
      toggle.appendChild(knob);

      toggle.onclick = () => {
        this._offPathAlert = !this._offPathAlert;
        this.render();
      };

      alertRow.append(alertIc, alertText, toggle);
      this.appendChild(alertRow);
    }

    // 6. Start sharing button
    const startBtn = createElement('button', {
      cls: 'cf-start-btn',
      attrs: {
        type: 'button',
        id: 'cf-start-sharing-btn'
      }
    });
    startBtn.disabled = this._selectedMemberIds.size === 0
      || !this._isOnline
      || this._startingSession
      || Boolean(this._reducedAccuracyConfirmation && !this._reducedAccuracyConfirmation.hidden)
      || (this._mode === 'path' && !this._routeCoordinates?.length);
    startBtn.appendChild(BeaconIcons.pin(14, '#FFFFFF', '#FFFFFF'));
    startBtn.appendChild(createElement('span', { text: 'Start sharing' }));

    startBtn.onclick = async () => {
      if (!navigator.onLine) {
        this._isOnline = false;
        this.updateStartAvailability();
        return;
      }
      if (this._mode === 'path' && !this._routeCoordinates?.length) {
        setText(this._hint, 'Your route is no longer available. Go back and draw it again.');
        return;
      }
      startBtn.disabled = true;
      try {
        const location = await requestCurrentLocation({
          allowRecentReducedAccuracy: true,
          onAccuracyUpdate: (fix, state) => {
            this._locationStatusMessage = `GPS accuracy ±${Math.round(fix.accuracy)} m · ${state}`;
            this.updateStartAvailability();
          }
        });
        const decision = getBeaconStartDecision(location.accuracy);
        if (decision === 'retry') {
          this._locationStatusMessage = `Location accuracy is ±${Math.round(location.accuracy)} m. Beacon can start only at ${BEACON_MAX_REDUCED_ACCURACY_METERS} m or better. Try again or choose route start on map.`;
          this.updateStartAvailability();
          return;
        }
        if (decision === 'confirm') {
          this._locationStatusMessage = `Current location accuracy: ±${Math.round(location.accuracy)} m.`;
          this.updateStartAvailability();
          this.showReducedAccuracyConfirmation(location);
          return;
        }
        await this.startSessionWithLocation(location, false);
      } catch (error) {
        this._locationStatusMessage = getLocationErrorMessage(error);
        this.updateStartAvailability();
        return;
      }
    };
    this.appendChild(startBtn);

    // Hint text
    const hint = createElement('div', {
      cls: 'cf-hint',
      attrs: { id: 'cf-start-hint', role: 'status', 'aria-live': 'polite' }
    });
    this._hintMessage = createElement('span');
    this._locationRetryBtn = createElement('button', {
      cls: 'cf-location-retry',
      attrs: { type: 'button', id: 'cf-location-retry-btn' },
      text: 'Retry location'
    });
    this._locationRetryBtn.hidden = true;
    this._locationRetryBtn.onclick = () => this.retryLocation();
    this._chooseRouteStartBtn = createElement('button', {
      cls: 'cf-location-retry cf-location-map-choice',
      attrs: { type: 'button', id: 'cf-choose-route-start-btn' },
      text: 'Choose route start on map'
    });
    this._chooseRouteStartBtn.hidden = true;
    this._chooseRouteStartBtn.onclick = () => navigate('beacon-home', { mode: 'choose' });
    hint.append(this._hintMessage, this._locationRetryBtn, this._chooseRouteStartBtn);
    this._hint = hint;
    this.appendChild(hint);
    this._reducedAccuracyConfirmation = createElement('section', {
      cls: 'cf-reduced-accuracy-confirmation',
      attrs: { id: 'cf-reduced-accuracy-confirmation', role: 'group', 'aria-label': 'Reduced accuracy confirmation' }
    });
    this._reducedAccuracyConfirmation.hidden = true;
    this.appendChild(this._reducedAccuracyConfirmation);
    this.updateStartAvailability();
  }

  showReducedAccuracyConfirmation(location) {
    const confirmation = this._reducedAccuracyConfirmation;
    if (!confirmation) return;
    clearChildren(confirmation);
    confirmation.hidden = false;
    confirmation.append(
      createElement('p', {
        text: `At ±${Math.round(location.accuracy)} m, off-path alerts and automatic arrival detection may be unreliable or paused.`
      })
    );
    const actions = createElement('div', { cls: 'cf-reduced-accuracy-actions' });
    const confirmButton = createElement('button', {
      attrs: { type: 'button' },
      text: 'Start anyway'
    });
    confirmButton.onclick = async () => {
      if (getBeaconStartDecision(location.accuracy, true) !== 'allow') return;
      if (!navigator.onLine) {
        this._isOnline = false;
        confirmation.hidden = true;
        this.updateStartAvailability();
        return;
      }
      confirmation.hidden = true;
      await this.startSessionWithLocation(location, true);
    };
    const cancelButton = createElement('button', {
      attrs: { type: 'button' },
      text: 'Cancel'
    });
    cancelButton.onclick = () => {
      confirmation.hidden = true;
      this._locationStatusMessage = '';
      this.updateStartAvailability();
    };
    actions.append(confirmButton, cancelButton);
    confirmation.appendChild(actions);
    this.updateStartAvailability();
  }

  async startSessionWithLocation(location, reducedAccuracyConfirmed) {
    if (!navigator.onLine) {
      this._isOnline = false;
      this._locationStatusMessage = 'Connect to the internet to start sharing your location.';
      this.updateStartAvailability();
      return;
    }
    if (this._mode === 'path') {
      const routeStart = this._routeCoordinates[0];
      if (!isValidBeaconRouteStart(
        location,
        { lat: routeStart[0], lng: routeStart[1] },
        { allowReducedAccuracy: reducedAccuracyConfirmed }
      )) {
        this._locationStatusMessage = 'Your current location does not match the route start. Go back and choose your actual starting point, then retry location.';
        this.updateStartAvailability();
        return;
      }
    }
    this._locationStatusMessage = '';
    this._startingSession = true;
    this.updateStartAvailability();
    try {
      await startActiveSession({
        mode: this._mode,
        destination: this._destination,
        duration: this._duration,
        offPathAlert: this._offPathAlert,
        memberIds: Array.from(this._selectedMemberIds),
        pathCoordinates: this._routeCoordinates,
        distance: this._distance,
        timeEstimate: this._time,
        eta: '6:52 PM',
        initialAccuracyMeters: location.accuracy,
        startedWithReducedAccuracy: reducedAccuracyConfirmed
      });
      clearPendingBeaconPath();
      navigate('beacon-share-session');
    } catch (error) {
      showToast(error.message || 'Could not start Beacon sharing. Please try again.', { type: 'error' });
      this._startingSession = false;
      this.updateStartAvailability();
    }
  }

  updateStartAvailability() {
    const startBtn = this.querySelector('#cf-start-sharing-btn');
    if (startBtn) {
      startBtn.disabled = this._selectedMemberIds.size === 0
        || !this._isOnline
        || (this._mode === 'path' && !this._routeCoordinates?.length);
    }
    if (this._hint) {
      setText(this._hintMessage,
        !this._isOnline
          ? 'Connect to the internet to start sharing your location.'
          : this._mode === 'path' && !this._routeCoordinates?.length
            ? 'Your route is no longer available. Go back and draw it again.'
            : this._locationStatusMessage
              ? this._locationStatusMessage
            : this._mode === 'path'
              ? 'You can stop any time. Sharing ends when you arrive.'
              : 'You can stop any time.'
      );
      this._locationRetryBtn.hidden = !this._locationStatusMessage || !this._isOnline;
      this._locationRetryBtn.disabled = this._locationRetryInProgress;
      this._chooseRouteStartBtn.hidden = !this._locationStatusMessage
        || !new RegExp(`${BEACON_MAX_REDUCED_ACCURACY_METERS} m or better|accuracy is low|approximate`, 'i')
          .test(this._locationStatusMessage);
    }
  }

  async retryLocation() {
    this._locationRetryInProgress = true;
    this._locationStatusMessage = 'Requesting a fresh location…';
    this.updateStartAvailability();
    try {
      const location = await requestCurrentLocation({ force: true });
      const decision = getBeaconStartDecision(location.accuracy);
      this._locationStatusMessage = decision === 'retry'
        ? `Location accuracy is ±${Math.round(location.accuracy)} m. Beacon can start only at ${BEACON_MAX_REDUCED_ACCURACY_METERS} m or better. Try again or choose route start on map.`
        : decision === 'confirm'
          ? `Current location accuracy is ±${Math.round(location.accuracy)} m. Starting in this range requires confirmation.`
          : '';
    } catch (error) {
      this._locationStatusMessage = getLocationErrorMessage(error);
    } finally {
      this._locationRetryInProgress = false;
      this.updateStartAvailability();
    }
  }
}
customElements.define('page-beacon-start-confirm', PageBeaconStartConfirm);
