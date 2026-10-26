/**
 * @file apps/resident-pwa/src/pages/beacon-home/beacon-home.js
 * Beacon Tab Root (Screen A: Beacon Main & Screen A2: Share Mode Chooser).
 * Safe DOM manipulation, full-bleed live map, interactive sheet, real-time pins.
 */

import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import runtimeConfig from '../../../runtime-config.js';
import {
  getBeaconState,
  getIncomingPendingCount,
  subscribeBeacon,
  refreshBeaconCircle,
  subscribeBeaconCircle
} from '../../features/beacon/beacon.client.js';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import {
  block as blockUser,
  removeConnection
} from '../../features/beacon/beacon-circle.client.js';
import { navigate } from '../../router.js';
import {
  BEACON_MAX_REDUCED_ACCURACY_METERS,
  BEACON_PRECISE_ACCURACY_METERS,
  BEACON_MAX_UNUSABLE_ACCURACY_METERS,
  createBeaconLocationWatchController,
  getBeaconAccuracyState,
  getCurrentLocation,
  getBeaconLocationDiagnostics,
  getLocationErrorMessage,
  getSelectedBeaconRouteStart,
  MAX_BEACON_LOCATION_ACCURACY_METERS,
  resetCurrentLocation,
  setBeaconLocationPermissionState,
  shouldShowBeaconAccuracyGuidance,
  setSelectedBeaconRouteStart,
  subscribeCurrentLocation
} from '../../features/beacon/beacon-location.js';
import {
  createBeaconDivIcon,
  createBeaconMap,
  mockPercentToLatLng,
  L
} from '../../features/beacon/leaflet-map.js';
import { getBeaconHomeFallbackMapView } from './beacon-home-map-view.js';

export class PageBeaconHome extends BaseElement {
  init(params) {
    this._params = params || {};
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-page');

    this._activeTab = 'live'; // 'live' | 'circle'
    this._sheetCollapsed = false;
    this._locationPromptDismissed = false;
    this._selectingRouteStart = false;
    this._accuracyTimedOut = false;
    this._mapHasCenteredOnLocation = false;
    this._locationAccuracyMessage = 'GPS accuracy · searching';
    this._accuracyWaitStartedAt = Date.now();
    this._accuracyGuidanceExpired = false;
    const debugRequested = this._params?.geodebug === '1'
      || new URLSearchParams(window.location.search).get('geodebug') === '1'
      || new URLSearchParams(window.location.hash.split('?')[1] || '').get('geodebug') === '1';
    this._debugEnabled = runtimeConfig.appEnvironment === 'development' && debugRequested;
    this._openModeAfterLocationPrompt = this._params?.mode === 'choose';

    this._unsubscribe = subscribeBeacon(() => {
      if (this.isConnected) this.render();
    });
    this._unsubscribeCircle = subscribeBeaconCircle((error) => {
      console.error('Beacon circle refresh failed:', error);
    });
    this._onCircleOnline = () => {
      refreshBeaconCircle().catch((error) => {
        console.error('Beacon circle reconnect refresh failed:', error);
      });
    };
    window.addEventListener('online', this._onCircleOnline);
    refreshBeaconCircle().catch((error) => {
      console.error('Beacon circle load failed:', error);
    });
    this._unsubscribeLocation = subscribeCurrentLocation((location) => {
      this.applyCurrentLocation(location);
    });

    this._onResetView = () => {
      this._sheetCollapsed = false;
      this.closeModeModal();
      this.render();
      this.detectLocationOnEntry();
      if (this._debugEnabled) {
        this._debugRefreshTimer = setInterval(() => this.updateLocationDiagnostics(), 1000);
      }
    };
    window.addEventListener('beacon:reset-view', this._onResetView);

    this.render();
    this.detectLocationOnEntry();

  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._unsubscribeCircle) this._unsubscribeCircle();
    window.removeEventListener('online', this._onCircleOnline);
    if (this._unsubscribeLocation) this._unsubscribeLocation();
    this._map?.remove();
    this._map = null;
    window.removeEventListener('beacon:reset-view', this._onResetView);
    this.stopAccuracyGuidanceTimer();
    clearInterval(this._debugRefreshTimer);
    this._permissionStatus?.removeEventListener?.('change', this._onPermissionChange);
    if (this._permissionStatus && this._permissionStatus.onchange === this._onPermissionChange) {
      this._permissionStatus.onchange = null;
    }
    this._permissionStatus = null;
    this._locationWatchController?.stop();
    this._locationWatchController = null;
    super.disconnectedCallback();
  }

  closeMemberActions() {
    this._memberActionDialog?.remove();
    this._memberActionDialog = null;
    this._memberActionButtons = [];
  }

  openMemberActions(member) {
    this.closeMemberActions();
    const backdrop = createElement('div', {
      cls: 'bc-member-actions-backdrop',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': `Actions for ${member.name}`
      }
    });
    const sheet = createElement('section', { cls: 'bc-member-actions-sheet' });
    sheet.append(
      createElement('h2', { cls: 'bc-member-actions-title', text: member.name }),
      createElement('p', {
        cls: 'bc-member-actions-copy',
        text: 'Choose how to manage this circle connection.'
      })
    );
    const removeButton = createElement('button', {
      cls: 'bc-member-action',
      attrs: { type: 'button' },
      text: 'Remove from circle'
    });
    const blockButton = createElement('button', {
      cls: ['bc-member-action', 'danger'],
      attrs: { type: 'button' },
      text: 'Block'
    });
    const cancelButton = createElement('button', {
      cls: 'bc-member-action-cancel',
      attrs: { type: 'button' },
      text: 'Cancel'
    });
    this._memberActionButtons = [removeButton, blockButton];
    removeButton.onclick = () => this.runMemberAction('remove', member);
    blockButton.onclick = () => this.runMemberAction('block', member);
    cancelButton.onclick = () => this.closeMemberActions();
    backdrop.onclick = (event) => {
      if (event.target === backdrop) this.closeMemberActions();
    };
    sheet.append(removeButton, blockButton, cancelButton);
    backdrop.appendChild(sheet);
    this._memberActionDialog = backdrop;
    this.appendChild(backdrop);
  }

  async runMemberAction(action, member) {
    const isBlock = action === 'block';
    const confirmation = isBlock
      ? 'They will be removed, cannot find or message you, and cannot send you requests.'
      : 'They will no longer see your chat or be able to message you. You can add them again later.';
    if (!window.confirm(`${isBlock ? 'Block' : 'Remove'} ${member.name}? ${confirmation}`)) return;

    for (const button of this._memberActionButtons || []) button.disabled = true;
    try {
      if (isBlock) await blockUser(member.id);
      else await removeConnection(member.id);
      await refreshBeaconCircle();
      showToast(isBlock ? 'Resident blocked.' : 'Resident removed from your circle.', { type: 'success' });
      this.closeMemberActions();
    } catch {
      showToast('Could not update your circle. Please try again.', { type: 'error' });
      for (const button of this._memberActionButtons || []) button.disabled = false;
    }
  }

  async detectLocationOnEntry() {
    this._locationPromptDismissed = false;
    let permissionState = 'unavailable';
    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        if (!this.isConnected) return;
        if (permissionStatus) {
          this._permissionStatus?.removeEventListener?.('change', this._onPermissionChange);
          if (this._permissionStatus?.onchange === this._onPermissionChange) {
            this._permissionStatus.onchange = null;
          }
          this._permissionStatus = permissionStatus;
          permissionState = this._permissionStatus.state || 'unavailable';
          this._onPermissionChange = () => this.handleLocationPermissionChange();
          if (this._permissionStatus.addEventListener) {
            this._permissionStatus.addEventListener('change', this._onPermissionChange);
          } else if ('onchange' in this._permissionStatus) {
            this._permissionStatus.onchange = this._onPermissionChange;
          }
        }
      }
    } catch (error) {
      console.warn('Beacon could not read location permission state:', error);
      this._permissionStatus = null;
      setBeaconLocationPermissionState('unavailable');
    }
    setBeaconLocationPermissionState(permissionState);
    if (!this.isConnected) return;
    this.updateLocationDiagnostics();
    if (!getCurrentLocation()) {
      this.showLocationPrompt(
        permissionState === 'denied'
          ? 'Location permission is blocked. Allow location access in your browser settings, then tap Try again.'
          : 'Beacon is requesting a high-accuracy GPS fix. Keep this page open while accuracy improves, or choose a route start on the map.',
        'Try again',
        permissionState === 'denied' ? 'Location access is blocked' : 'Improving location accuracy'
      );
    }
    this.startLocationWatch();
    if (this.isConnected && this._openModeAfterLocationPrompt) {
      this.openModeModal();
    }
  }

  startLocationWatch({ reset = false } = {}) {
    if (reset) {
      this._locationWatchController?.stop();
      this._locationPromptDismissed = false;
      this._mapHasCenteredOnLocation = false;
      this._accuracyWaitStartedAt = Date.now();
      this._accuracyGuidanceExpired = false;
      resetCurrentLocation();
      this.showLocationPrompt(
        'Restarted high-accuracy GPS. Beacon will keep listening as accuracy improves; choose a route start on the map if needed.',
        'Try again',
        'Improving location accuracy'
      );
    }
    if (!this._locationWatchController) {
      this._locationWatchController = createBeaconLocationWatchController(
        (error) => {
          if (error?.code === 1) this.stopAccuracyGuidanceTimer();
          if (!this.isConnected) return;
          this._locationAccuracyMessage = getLocationErrorMessage(error);
          this.updateLocationDiagnostics();
          this.updateLocationAccuracyStatus();
          if (!this._selectingRouteStart) {
            this.showLocationPrompt(
              `${getLocationErrorMessage(error)} Try again or choose a manual route start on the map; it is not GPS-verified.`,
              'Try again',
              error?.code === 1 ? 'Location access is blocked' : 'Location unavailable'
            );
          }
        },
        {
          onAccuracyUpdate: (location, bestLocation, state) => {
            if (!this.isConnected) return;
            this._accuracyTimedOut = false;
            if (this._debugEnabled) {
              console.info('Beacon location fix:', {
                accuracyMeters: location.accuracy,
                timestamp: location.timestamp,
                band: state
              });
            }
            this.updateLocationDiagnostics();
            const accuracy = location.accuracy >= 1000
              ? `${Math.round(location.accuracy / 1000)} km`
              : `${Math.round(location.accuracy)} m`;
            if (state === 'too coarse') {
              this._locationAccuracyMessage = `GPS accuracy ±${accuracy} · too coarse · searching`;
              this.updateLocationAccuracyStatus();
              const message = location.accuracy > BEACON_MAX_UNUSABLE_ACCURACY_METERS
                ? 'Your device is returning a network or IP-based location, not a usable GPS fix. Beacon is waiting for a better reading.'
                : `The current ±${accuracy} reading is too coarse. Beacon is still waiting for a fix within ${BEACON_MAX_REDUCED_ACCURACY_METERS} m.`;
              if (!this._selectingRouteStart) {
                this.showLocationPrompt(
                  `${message} You can retry or choose a manual map pin; it is not GPS-verified.`,
                  'Try again',
                  'Location is too coarse'
                );
              }
            } else if (state === 'usable (confirm)') {
              this._locationAccuracyMessage = `GPS accuracy ±${Math.round(bestLocation.accuracy)} m · usable (confirm) · waiting for a precise fix`;
              this.updateLocationAccuracyStatus();
              if (!this._selectingRouteStart) {
                this.showLocationPrompt(
                  `A usable ±${Math.round(bestLocation.accuracy)} m fix is available. Beacon is still searching for a precise fix; reduced-accuracy confirmation will be offered if accuracy does not improve before the 30-second search ends.`,
                  'Try again',
                  'Improving location accuracy'
                );
              }
            } else {
              this._locationAccuracyMessage = `GPS accuracy ±${Math.round(location.accuracy)} m · precise`;
              this.updateLocationAccuracyStatus();
              this.stopAccuracyGuidanceTimer();
            }
          },
          onTimeout: (location, bestLocation) => {
            this.stopAccuracyGuidanceTimer();
            if (!this.isConnected) return;
            this._accuracyTimedOut = true;
            if (location) {
              const accuracy = Math.round(location.accuracy);
              this._locationAccuracyMessage = `GPS accuracy ±${accuracy} m · usable (confirm)`;
              this.updateLocationAccuracyStatus();
              if (!this._selectingRouteStart) {
                this.showLocationPrompt(
                  `Couldn't get a precise location within 30 seconds. The best fix is ±${accuracy} m; you can continue only after confirming reduced accuracy, or retry. A map pin is manual and not GPS-verified.`,
                  `Continue with ±${accuracy} m`,
                  'Confirm approximate location'
                );
              }
              return;
            }
            const bestAccuracy = bestLocation
              ? ` Best reading was ±${Math.round(bestLocation.accuracy)} m.`
              : '';
            this._locationAccuracyMessage = `Couldn't get a precise location.${bestAccuracy} Retry or choose a manual map pin.`;
            this.updateLocationAccuracyStatus();
            if (!this._selectingRouteStart) {
              this.showLocationPrompt(
                `${this._locationAccuracyMessage} A map pin is manual and not GPS-verified.`,
                'Try again',
                'Couldn’t get a precise location'
              );
            }
          }
        }
      );
    }
    if (this._locationWatchController.isWatching) return;
    this._accuracyWaitStartedAt = this._accuracyWaitStartedAt || Date.now();
    if (!this._accuracyGuidanceTimer) {
      this._accuracyGuidanceTimer = setInterval(() => this.updateAccuracyGuidance(), 1000);
    }
    try {
      this._locationWatchController.start();
    } catch (error) {
      this.stopAccuracyGuidanceTimer();
      this._locationAccuracyMessage = getLocationErrorMessage(error);
      this.updateLocationAccuracyStatus();
      this.showLocationPrompt(getLocationErrorMessage(error), 'Try again', 'Location unavailable');
    }
  }

  stopAccuracyGuidanceTimer() {
    clearInterval(this._accuracyGuidanceTimer);
    this._accuracyGuidanceTimer = null;
  }

  handleLocationPermissionChange() {
    if (!this.isConnected || !this._permissionStatus) return;
    const permissionState = this._permissionStatus.state;
    setBeaconLocationPermissionState(permissionState);
    this.updateLocationDiagnostics();
    if (permissionState === 'granted') {
      this.startLocationWatch({ reset: true });
      return;
    }
    if (permissionState === 'denied') {
      this._locationWatchController?.stop();
      this.showLocationPrompt(
        'Location permission is blocked. Allow location access in your browser settings, then tap Try again.',
        'Try again',
        'Location access is blocked'
      );
    }
  }

  updateAccuracyGuidance() {
    if (!this.isConnected || this._permissionStatus?.state === 'denied') {
      this._accuracyGuidanceExpired = false;
      return;
    }
    if (this._accuracyWaitStartedAt === null || this._accuracyWaitStartedAt === undefined) {
      this._accuracyWaitStartedAt = Date.now();
    }
    if (
      !shouldShowBeaconAccuracyGuidance(this._accuracyWaitStartedAt, Date.now(), getCurrentLocation())
      || this._accuracyGuidanceExpired
    ) return;
    this._accuracyGuidanceExpired = true;
    this._locationAccuracyMessage = 'Location is still approximate. Check Location Services and precise location, then try near a window or outdoors.';
    this.updateLocationAccuracyStatus();
    if (!this._selectingRouteStart) {
      this.showLocationPrompt(
        'Your device may be using network or IP location. Check that Location Services and precise location are on, then try near a window or outdoors.',
        'Try again',
        'Location is still approximate'
      );
    }
  }

  updateLocationDiagnostics() {
    if (!this._debugEnabled) return;
    const panel = this.querySelector('#bc-location-diagnostics');
    if (!panel) return;
    const report = getBeaconLocationDiagnostics();
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || navigator.standalone === true;
    const values = {
      permission: report.permissionState,
      secureContext: String(window.isSecureContext === true),
      mode: standalone ? 'installed PWA' : 'browser',
      latestAccuracy: report.latestAccuracyMeters === null ? 'none' : `${Math.round(report.latestAccuracyMeters)} m`,
      sinceLastFix: report.timeSinceLastFixMs === null
        ? 'none'
        : `${Math.floor(report.timeSinceLastFixMs / 1000)} s`,
      fixesReceived: String(report.fixesReceived),
      bestAccuracy: report.bestAccuracyMeters === null ? 'none' : `${Math.round(report.bestAccuracyMeters)} m`,
      lastError: report.lastErrorCode === null
        ? 'none'
        : `${report.lastErrorCode}: ${report.lastErrorMessage}`
    };
    for (const [key, value] of Object.entries(values)) {
      const output = panel.querySelector(`[data-diagnostic="${key}"]`);
      if (output) output.textContent = value;
    }
  }

  async copyLocationReport() {
    const report = getBeaconLocationDiagnostics();
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || navigator.standalone === true;
    const accuracy = (value) => value === null ? 'none' : `${Math.round(value)} m`;
    const lines = [
      `Permission: ${report.permissionState}`,
      `Secure context: ${window.isSecureContext === true}`,
      `Mode: ${standalone ? 'installed PWA' : 'browser'}`,
      `Latest accuracy: ${accuracy(report.latestAccuracyMeters)}`,
      `Time since last fix: ${report.timeSinceLastFixMs === null ? 'none' : `${Math.floor(report.timeSinceLastFixMs / 1000)} s`}`,
      `Fixes received: ${report.fixesReceived}`,
      `Best accuracy: ${accuracy(report.bestAccuracyMeters)}`,
      `Last error: ${report.lastErrorCode === null ? 'none' : `${report.lastErrorCode}: ${report.lastErrorMessage}`}`
    ];
    const status = this.querySelector('#bc-location-diagnostics-copy-status');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser.');
      await navigator.clipboard.writeText(lines.join('\n'));
      if (status) status.textContent = 'Report copied.';
    } catch (error) {
      if (status) status.textContent = `Could not copy report: ${error.message}`;
    }
  }

  updateLocationAccuracyStatus() {
    const status = this.querySelector('.bc-location-accuracy-status');
    if (status) status.textContent = this._locationAccuracyMessage;
  }

  showLocationPrompt(message, actionLabel = 'Allow permission', title = 'Allow location access') {
    if (this._locationPromptDismissed) return;
    this._locationPromptMessage = message;
    this._locationPromptActionLabel = actionLabel;
    this._locationPromptTitle = title;
    const prompt = this.querySelector('#bc-location-prompt');
    const wasHidden = !prompt || prompt.hidden;
    const promptTitle = prompt?.querySelector('#bc-location-prompt-title');
    const promptMessage = prompt?.querySelector('.bc-location-prompt-message');
    const action = prompt?.querySelector('.bc-location-allow');
    if (promptTitle) promptTitle.textContent = title;
    if (promptMessage) promptMessage.textContent = message;
    if (action) action.textContent = actionLabel;
    if (prompt) {
      prompt.hidden = false;
      if (wasHidden) action?.focus();
    }
  }

  hideLocationPrompt() {
    this._locationPromptMessage = '';
    this._locationPromptActionLabel = '';
    this._locationPromptTitle = '';
    const prompt = this.querySelector('#bc-location-prompt');
    if (prompt) prompt.hidden = true;
  }

  dismissLocationPrompt() {
    this._locationPromptDismissed = true;
    this.hideLocationPrompt();
  }

  chooseRouteStartOnMap() {
    this._locationPromptDismissed = false;
    this._selectingRouteStart = true;
    this.hideLocationPrompt();
    this._map.getContainer().style.cursor = 'crosshair';
    this.showLocationPrompt(
      'Pan and zoom the map, then tap where the route should start. This is a manual map pin, not GPS-verified and not a live location.',
      'Cancel map selection',
      'Choose route start'
    );
    const prompt = this.querySelector('#bc-location-prompt');
    const selectButton = prompt?.querySelector('.bc-location-allow');
    if (selectButton) selectButton.onclick = () => this.cancelRouteStartSelection();
    this._map.once('click', (event) => {
      if (!this.isConnected || !this._selectingRouteStart) return;
      this._selectingRouteStart = false;
      this._map.getContainer().style.cursor = '';
      const selectedStart = setSelectedBeaconRouteStart({
        lat: event.latlng.lat,
        lng: event.latlng.lng
      });
      this._manualRouteStartMarker?.remove();
      this._manualRouteStartMarker = L.marker([selectedStart.lat, selectedStart.lng], {
        icon: createBeaconDivIcon('S', 'destination'),
        title: 'Manual route start (not GPS-verified)'
      }).addTo(this._map);
      this._manualRouteStartMarker.bindTooltip('Manual route start (not GPS-verified)', { direction: 'bottom', offset: [0, 16] });
      this.showLocationPrompt(
        'Manual route start pinned (not GPS-verified). Beacon still needs an acceptable GPS fix before sharing.',
        'Choose another point',
        'Route start selected'
      );
      const chooseAgain = this.querySelector('#bc-location-prompt .bc-location-allow');
      if (chooseAgain) chooseAgain.onclick = () => this.chooseRouteStartOnMap();
    });
  }

  cancelRouteStartSelection() {
    this._selectingRouteStart = false;
    if (this._map) this._map.getContainer().style.cursor = '';
    this.dismissLocationPrompt();
  }

  requestLocationFromPrompt() {
    if (this._selectingRouteStart) {
      this.cancelRouteStartSelection();
      return;
    }
    const location = getCurrentLocation();
    if (
      this._accuracyTimedOut
      && location
      && location.accuracy >= BEACON_PRECISE_ACCURACY_METERS
      && location.accuracy <= BEACON_MAX_REDUCED_ACCURACY_METERS
    ) {
      this.dismissLocationPrompt();
      this.openModeModal();
      return;
    }
    this.startLocationWatch({ reset: true });
  }

  applyCurrentLocation(location) {
    if (!this._map) return;
    if (!location) {
      this._currentUserMarker?.remove();
      this._locationAccuracyCircle?.remove();
      this._currentUserMarker = null;
      this._locationAccuracyCircle = null;
      this._locationAccuracyMessage = 'GPS accuracy · searching';
      this._accuracyTimedOut = false;
      if (this._accuracyWaitStartedAt === null || this._accuracyWaitStartedAt === undefined) {
        this._accuracyWaitStartedAt = Date.now();
      }
      this.updateLocationAccuracyStatus();
      this.updateLocationDiagnostics();
      if (!this._manualRouteStartMarker && !this._mapHasCenteredOnLocation) {
        const fallbackView = getBeaconHomeFallbackMapView();
        this._map.setView(fallbackView.center, fallbackView.zoom);
      }
      return;
    }

    const accuracy = location.accuracy;
    this.updateLocationDiagnostics();
    const accuracyText = accuracy >= 1000
      ? `${Math.round(accuracy / 1000)} km`
      : `${Math.round(accuracy)} m`;
    const isPrecise = accuracy < BEACON_PRECISE_ACCURACY_METERS;
    if (isPrecise) {
      this._accuracyWaitStartedAt = location.timestamp;
      this._accuracyGuidanceExpired = false;
    } else if (this._accuracyWaitStartedAt === null || this._accuracyWaitStartedAt === undefined) {
      this._accuracyWaitStartedAt = Date.now();
      this._accuracyGuidanceExpired = false;
    }
    if (accuracy > MAX_BEACON_LOCATION_ACCURACY_METERS && !this._mapHasCenteredOnLocation) {
      const fallbackView = getBeaconHomeFallbackMapView();
      this._map.setView(fallbackView.center, fallbackView.zoom);
    }
    this._locationAccuracyMessage = `GPS accuracy ±${accuracyText} · ${getBeaconAccuracyState(accuracy)}`;
    this.updateLocationAccuracyStatus();

    const latLng = [location.lat, location.lng];
    if (this._locationAccuracyCircle) {
      this._locationAccuracyCircle.setLatLng(latLng);
      this._locationAccuracyCircle.setRadius(accuracy);
      this._locationAccuracyCircle.setStyle({
        dashArray: isPrecise ? null : '6 8',
        fillOpacity: isPrecise ? 0.12 : 0.05
      });
    } else {
      this._locationAccuracyCircle = L.circle(latLng, {
        radius: accuracy,
        color: '#1C8C99',
        weight: 1,
        opacity: 0.65,
        fillColor: '#1C8C99',
        fillOpacity: isPrecise ? 0.12 : 0.05,
        dashArray: isPrecise ? null : '6 8',
        interactive: false
      }).addTo(this._map);
    }

    if (accuracy <= MAX_BEACON_LOCATION_ACCURACY_METERS) {
      const user = getBeaconState().currentUser;
      const markerLabel = isPrecise
        ? `${user.name} (verified GPS location)`
        : `Approximate location (±${accuracyText} accuracy)`;
      const markerIcon = isPrecise
        ? createBeaconDivIcon(user.initial, 'self')
        : createBeaconDivIcon('~', 'destination');
      if (this._currentUserMarker) {
        this._currentUserMarker.setLatLng(latLng);
        this._currentUserMarker.setIcon(markerIcon);
        this._currentUserMarker.options.title = markerLabel;
      } else {
        this._currentUserMarker = L.marker(latLng, {
          icon: markerIcon,
          title: markerLabel
        }).addTo(this._map);
      }
      this._currentUserMarker.getElement()?.setAttribute('aria-label', markerLabel);
      this._currentUserMarker.getElement()?.setAttribute('title', markerLabel);
    } else {
      this._currentUserMarker?.remove();
      this._currentUserMarker = null;
    }

    if (
      accuracy <= MAX_BEACON_LOCATION_ACCURACY_METERS
      && !this._mapHasCenteredOnLocation
      && !this._selectingRouteStart
    ) {
      this._map.setView(latLng, Math.max(this._map.getZoom(), 15));
      this._mapHasCenteredOnLocation = true;
    }
  }

  openModeModal() {
    const modal = this.querySelector('#bc-mode-modal');
    const mapWrap = this.querySelector('.bc-map-wrap');
    if (modal) modal.classList.add('open');
    if (mapWrap) mapWrap.classList.add('dim');
  }

  closeModeModal() {
    const modal = this.querySelector('#bc-mode-modal');
    const mapWrap = this.querySelector('.bc-map-wrap');
    if (modal) modal.classList.remove('open');
    if (mapWrap) mapWrap.classList.remove('dim');
  }

  render() {
    const previousMapView = this._map
      ? { center: this._map.getCenter(), zoom: this._map.getZoom() }
      : null;
    this._map?.remove();
    this._map = null;
    clearChildren(this);
    const state = getBeaconState();
    const members = state.members || [];
    const liveMembers = members.filter((m) => m.isSharing);

    // 1. Full-bleed map wrap
    const mapWrap = createElement('div', { cls: 'bc-map-wrap' });
    const map = createElement('div', {
      cls: 'bc-map',
      attrs: { 'aria-label': 'Beacon prototype map', id: 'bc-leaflet-map' }
    });
    this._map = createBeaconMap(map, { zoom: 15 });
    L.control.zoom({ position: 'topright' }).addTo(this._map);
    if (previousMapView) {
      this._map.setView(previousMapView.center, previousMapView.zoom);
    }
    const detectedLocation = getCurrentLocation();
    if (
      (!detectedLocation || detectedLocation.accuracy > MAX_BEACON_LOCATION_ACCURACY_METERS)
      && !previousMapView
    ) {
      const fallbackView = getBeaconHomeFallbackMapView();
      this._map.setView(fallbackView.center, fallbackView.zoom);
    }

    this._currentUserMarker = null;
    this._locationAccuracyCircle = null;
    this._manualRouteStartMarker = null;
    this._map.on('dragstart zoomstart', () => {
      this._mapHasCenteredOnLocation = true;
    });

    // Mocked pins are previews; the app does not receive other users' locations.
    for (const member of liveMembers) {
      const livePin = L.marker(mockPercentToLatLng(member), {
        icon: createBeaconDivIcon(member.initial),
        title: `${member.name}: prototype preview`
      }).addTo(this._map);
      livePin.getElement()?.setAttribute(
        'aria-label',
        `${member.name}, prototype location preview; not shared with others`
      );
      livePin.on('click', () => navigate('beacon-chat', { memberId: member.id }));
    }

    mapWrap.appendChild(map);
    if (this._debugEnabled) {
      const diagnostics = createElement('section', {
        cls: 'bc-location-diagnostics',
        attrs: { id: 'bc-location-diagnostics', 'aria-label': 'Location diagnostics' }
      });
      diagnostics.appendChild(createElement('strong', { text: 'Location diagnostics' }));
      const fields = [
        ['permission', 'Permission'],
        ['secureContext', 'Secure context'],
        ['mode', 'Mode'],
        ['latestAccuracy', 'Latest accuracy'],
        ['sinceLastFix', 'Since last fix'],
        ['fixesReceived', 'Fixes received'],
        ['bestAccuracy', 'Best accuracy'],
        ['lastError', 'Last error']
      ];
      for (const [key, label] of fields) {
        const line = createElement('div');
        line.append(
          createElement('span', { text: `${label}: ` }),
          createElement('span', { attrs: { 'data-diagnostic': key }, text: '…' })
        );
        diagnostics.appendChild(line);
      }
      const copyButton = createElement('button', {
        attrs: { type: 'button' },
        text: 'Copy report'
      });
      copyButton.onclick = () => this.copyLocationReport();
      diagnostics.append(
        copyButton,
        createElement('span', {
          attrs: { id: 'bc-location-diagnostics-copy-status', role: 'status', 'aria-live': 'polite' }
        })
      );
      mapWrap.appendChild(diagnostics);
    }
    this.appendChild(mapWrap);
    this._map.invalidateSize();
    const currentLocation = getCurrentLocation();
    if (currentLocation) this.applyCurrentLocation(currentLocation);
    this.updateLocationDiagnostics();
    const selectedRouteStart = getSelectedBeaconRouteStart();
    if (selectedRouteStart) {
      this._manualRouteStartMarker = L.marker([selectedRouteStart.lat, selectedRouteStart.lng], {
        icon: createBeaconDivIcon('S', 'destination'),
        title: 'Manual route start (not GPS-verified)'
      }).addTo(this._map);
      this._manualRouteStartMarker.bindTooltip('Manual route start (not GPS-verified)', { direction: 'bottom', offset: [0, 16] });
    }

    // 2. Floating top bar
    const topbar = createElement('div', { cls: 'bc-topbar' });

    const titlePill = createElement('div', { cls: 'bc-title-pill', attrs: { role: 'status' } });
    titlePill.appendChild(BeaconIcons.pin(13, 'var(--beacon, #1C8C99)'));
    const titleText = createElement('span', { text: 'Beacon' });
    titlePill.appendChild(titleText);

    const addBtn = createElement('button', {
      cls: 'bc-add-btn',
      attrs: {
        type: 'button',
        'aria-label': 'Add to your circle',
        title: 'Add to your circle',
        id: 'bc-add-btn'
      }
    });
    addBtn.appendChild(BeaconIcons.plus(14, '#ffffff'));
    addBtn.onclick = () => navigate('beacon-add-to-circle');

    topbar.append(titlePill, addBtn);
    this.appendChild(topbar);

    const incomingPendingCount = getIncomingPendingCount();
    if (incomingPendingCount > 0) {
      const requestsBanner = createElement('a', {
        cls: 'bc-requests-banner',
        attrs: {
          href: '#beacon-requests',
          'aria-label': `${incomingPendingCount} circle ${incomingPendingCount === 1 ? 'request' : 'requests'} waiting`
        },
        text: `${incomingPendingCount} circle ${incomingPendingCount === 1 ? 'request' : 'requests'} waiting`
      });
      requestsBanner.onclick = (event) => {
        event.preventDefault();
        navigate('beacon-requests');
      };
      this.appendChild(requestsBanner);
    }

    // 3. Bottom sheet
    const sheet = createElement('section', {
      cls: 'bc-sheet',
      attrs: { 'aria-label': 'Beacon live circle', id: 'bc-sheet' }
    });

    const handle = createElement('div', {
      cls: 'bc-sheet-handle',
      attrs: { 'aria-hidden': 'true' }
    });
    handle.onclick = () => {
      this._sheetCollapsed = !this._sheetCollapsed;
      sheet.style.maxHeight = this._sheetCollapsed ? '72px' : '';
    };

    const shareBtn = createElement('button', {
      cls: 'bc-cta-share',
      attrs: {
        type: 'button',
        'aria-label': 'Choose a Beacon location-sharing option',
        id: 'bc-share-location-btn'
      }
    });
    shareBtn.appendChild(BeaconIcons.pin(14, '#ffffff', '#ffffff'));
    const shareText = createElement('span', { text: 'Share location' });
    shareBtn.appendChild(shareText);
    shareBtn.onclick = () => {
      this.dismissLocationPrompt();
      this.openModeModal();
    };

    // Tabs row
    const tabsRow = createElement('div', {
      cls: 'bc-tabs',
      attrs: { role: 'tablist', 'aria-label': 'Circle members view' }
    });

    const liveTab = createElement('button', {
      cls: ['bc-tab', this._activeTab === 'live' ? 'active' : ''],
      attrs: {
        type: 'button',
        role: 'tab',
        'aria-selected': this._activeTab === 'live' ? 'true' : 'false',
        id: 'bc-tab-live'
      },
      text: `Live preview · ${liveMembers.length}`
    });

    const circleTab = createElement('button', {
      cls: ['bc-tab', this._activeTab === 'circle' ? 'active' : ''],
      attrs: {
        type: 'button',
        role: 'tab',
        'aria-selected': this._activeTab === 'circle' ? 'true' : 'false',
        id: 'bc-tab-circle'
      },
      text: `My circle · ${members.length}`
    });

    liveTab.onclick = () => {
      this._activeTab = 'live';
      this.renderMemberList(memberList, liveMembers, members);
      liveTab.classList.add('active');
      circleTab.classList.remove('active');
      liveTab.setAttribute('aria-selected', 'true');
      circleTab.setAttribute('aria-selected', 'false');
    };

    circleTab.onclick = () => {
      this._activeTab = 'circle';
      this.renderMemberList(memberList, liveMembers, members);
      liveTab.classList.remove('active');
      circleTab.classList.add('active');
      liveTab.setAttribute('aria-selected', 'false');
      circleTab.setAttribute('aria-selected', 'true');
    };

    tabsRow.append(liveTab, circleTab);

    // Member list
    const memberList = createElement('div', {
      cls: 'bc-member-list',
      attrs: { role: 'tabpanel', id: 'bc-member-list' }
    });
    this.renderMemberList(memberList, liveMembers, members);

    sheet.append(handle, shareBtn, tabsRow, memberList);
    this.appendChild(sheet);

    // 4. Screen A2: Share mode chooser modal
    this.renderShareModeModal();
  }

  renderShareModeModal() {
    const modalBackdrop = createElement('div', {
      cls: ['modal-backdrop', 'mode-backdrop'],
      attrs: { id: 'bc-mode-modal', 'aria-modal': 'true', role: 'dialog' }
    });

    modalBackdrop.onclick = (e) => {
      if (e.target === modalBackdrop) this.closeModeModal();
    };

    const modeSheet = createElement('div', { cls: ['sheet', 'mode-sheet'] });
    const modeHandle = createElement('div', { cls: 'sheet-handle' });
    const modeTitle = createElement('div', { cls: 'sheet-title', text: 'Share location' });
    const modeSub = createElement('div', {
      cls: 'sheet-sub',
      text: 'Live location updates only while Bika is open. You can stop sharing any time.'
    });

    // Option 1: Share live location
    const optLive = createElement('div', {
      cls: ['sh-use', 'opt-live'],
      attrs: { role: 'button', tabindex: '0', id: 'bc-opt-live-location' }
    });
    const icLive = createElement('div', { cls: 'u-ic' });
    icLive.appendChild(BeaconIcons.pin(18, 'var(--beacon, #1C8C99)'));
    const textLive = createElement('div', { attrs: { style: 'flex: 1;' } });
    const tLive = createElement('div', { cls: 'u-t', text: 'Live tracking' });
    const dLive = createElement('div', {
      cls: 'u-d',
      text: 'Share with one accepted contact for 15, 30 or 60 minutes.'
    });
    textLive.append(tLive, dLive);
    const chevLive = createElement('div', { cls: 'sh-chev' });
    chevLive.appendChild(BeaconIcons.chevronRight(14, '#B0AFA5'));
    optLive.append(icLive, textLive, chevLive);
    optLive.onclick = () => {
      this.closeModeModal();
      navigate('beacon-start-confirm');
    };
    optLive.onkeydown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      optLive.click();
    };

    // Option 2: Draw a path
    const optDraw = createElement('div', {
      cls: ['sh-use', 'opt-draw'],
      attrs: { role: 'button', 'aria-disabled': 'true', id: 'bc-opt-draw-path' }
    });
    const icDraw = createElement('div', { cls: 'u-ic' });
    icDraw.appendChild(BeaconIcons.route(18, 'var(--beacon, #1C8C99)'));
    const textDraw = createElement('div', { attrs: { style: 'flex: 1;' } });
    const tDraw = createElement('div', { cls: 'u-t', text: 'Draw a path' });
    const dDraw = createElement('div', {
      cls: 'u-d',
      text: 'Not available yet'
    });
    const tagDraw = createElement('div', { cls: 'sh-tag', text: 'Safer for walks' });
    textDraw.append(tDraw, dDraw, tagDraw);
    const chevDraw = createElement('div', { cls: 'sh-chev' });
    chevDraw.appendChild(BeaconIcons.chevronRight(14, '#B0AFA5'));
    optDraw.append(icDraw, textDraw, chevDraw);
    // Cancel ghost button
    const cancelBtn = createElement('button', {
      cls: ['btn-flat', 'ghost', 'mode-cancel'],
      attrs: { type: 'button', id: 'bc-mode-cancel' },
      text: 'Cancel'
    });
    cancelBtn.onclick = () => this.closeModeModal();

    modeSheet.append(modeHandle, modeTitle, modeSub, optLive, optDraw, cancelBtn);
    modalBackdrop.appendChild(modeSheet);
    this.appendChild(modalBackdrop);
  }

  renderMemberList(container, liveMembers, allMembers) {
    clearChildren(container);
    const currentList = this._activeTab === 'live' ? liveMembers : allMembers;

    if (currentList.length === 0) {
      const empty = createElement('div', { cls: 'bc-empty-state' });
      const title = createElement('div', {
        cls: 'bc-empty-title',
        text: this._activeTab === 'live' ? 'No live preview available' : 'Your circle is empty'
      });
      const desc = createElement('div', {
        cls: 'bc-empty-desc',
        text: this._activeTab === 'live'
          ? 'Live locations appear in chat while a circle contact shares with you.'
          : 'Add trusted contacts to your circle. Live location sharing is available in chat for a set time.'
      });
      empty.append(title, desc);

      if (this._activeTab === 'circle') {
        const addBtn = createElement('button', {
          cls: 'bc-empty-btn',
          attrs: { type: 'button' },
          text: 'Add to your circle'
        });
        addBtn.onclick = () => navigate('beacon-add-to-circle');
        empty.appendChild(addBtn);
      }

      container.appendChild(empty);
      return;
    }

    for (const member of currentList) {
      const row = createElement('div', {
        cls: 'bc-member-row',
        attrs: {
          role: 'button',
          tabindex: '0',
          'aria-label': `${member.name}, ${member.statusText}`
        }
      });

      // Avatar with optional live badge
      const avatar = createElement('div', {
        cls: 'bc-avatar',
        text: member.initial
      });
      if (member.isSharing) {
        const liveBadge = createElement('div', { cls: 'bc-live-badge' });
        avatar.appendChild(liveBadge);
      }

      // Member details
      const textCol = createElement('div', { cls: 'bc-text' });
      const name = createElement('div', { cls: 'bc-name', text: member.name });
      const status = createElement('div', {
        cls: ['bc-status', member.isSharing ? 'live' : ''],
        text: member.statusText || 'Not sharing'
      });
      textCol.append(name, status);

      // Message button
      const msgBtn = createElement('button', {
        cls: 'bc-msg-btn',
        attrs: {
          type: 'button',
          'aria-label': `Message ${member.name}`,
          title: `Message ${member.name}`
        }
      });
      msgBtn.appendChild(BeaconIcons.message(13, 'var(--teal-deep, #085041)'));
      msgBtn.onclick = (e) => {
        e.stopPropagation();
        navigate('beacon-chat', { memberId: member.id });
      };
      const moreBtn = createElement('button', {
        cls: 'bc-member-more-btn',
        attrs: {
          type: 'button',
          'aria-label': `More actions for ${member.name}`,
          title: 'More actions'
        },
        text: '⋯'
      });
      moreBtn.onclick = (event) => {
        event.stopPropagation();
        this.openMemberActions(member);
      };

      row.onclick = () => {
        navigate('beacon-chat', { memberId: member.id });
      };
      row.onkeydown = (event) => {
        if (event.target !== row || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        navigate('beacon-chat', { memberId: member.id });
      };

      row.append(avatar, textCol, msgBtn, moreBtn);
      container.appendChild(row);
    }
  }
}
customElements.define('page-beacon-home', PageBeaconHome);
