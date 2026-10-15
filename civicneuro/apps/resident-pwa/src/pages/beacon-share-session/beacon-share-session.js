/**
 * @file apps/resident-pwa/src/pages/beacon-share-session/beacon-share-session.js
 * Screen D: Live session & Screen D2: Off-path alert state.
 * Full-screen map, dotted route line, moving position marker, destination pin,
 * floating session card, stop sharing, off-path alert banner and update routing.
 */

import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import {
  BEACON_MAX_REDUCED_ACCURACY_METERS,
  BEACON_PRECISE_ACCURACY_METERS,
  getBeaconAccuracyTier,
  getCurrentLocation,
  getLocationErrorMessage,
  isWithinBeaconArrivalZone,
  requestCurrentLocation,
  subscribeCurrentLocation,
  watchCurrentLocation
} from '../../features/beacon/beacon-location.js';
import {
  getActiveSession,
  stopActiveSession,
  setSessionOffPath,
  subscribeBeacon,
  getBeaconState
} from '../../features/beacon/beacon.client.js';
import {
  createBeaconDivIcon,
  createBeaconDotIcon,
  createBeaconMap,
  mockPathToLatLngs,
  rebasePathToLocation,
  L
} from '../../features/beacon/leaflet-map.js';
import {
  getOffPathMonitor,
  resetOffPathMonitor
} from '../../features/beacon/off-path-monitor.js';
import { navigate } from '../../router.js';

const LOCATION_STALE_AFTER_MS = 30000;

export class PageBeaconShareSession extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-session-page');

    const session = getActiveSession();
    if (!session) {
      showToast('Start a Beacon session before opening live sharing.', { type: 'info' });
      navigate('beacon-home');
      return;
    }

    this._offPathMonitor = getOffPathMonitor(session, {
      initiallyOffPath: Boolean(session.isOffPath)
    });
    this._monitoredPathCoordinates = session.pathCoordinates;
    this._stepIndex = 0;
    this._latestLocation = getCurrentLocation();
    this._locationWatchError = null;
    this._unsubscribeLocation = subscribeCurrentLocation((location) => {
      this._latestLocation = location;
      const activeSession = getActiveSession();
      if (
        activeSession?.reducedAccuracy
        && location
        && location.accuracy < BEACON_PRECISE_ACCURACY_METERS
        && Date.now() - location.timestamp <= LOCATION_STALE_AFTER_MS
      ) {
        activeSession.reducedAccuracy = false;
      }
      this._locationWatchError = null;
      this._locationErrorShown = false;
      if (this._routeNeedsLocationAnchor()) {
        this.render();
        return;
      }
      this.updateAccuracyStatus();
      this.updateMarkerPosition();
      this.updateOffPathState({ fromLocationUpdate: true });
    });
    try {
      this._stopWatchingLocation = watchCurrentLocation((error) => this.reportLocationError(error));
    } catch (error) {
      this.reportLocationError(error);
    }

    this._unsubscribe = subscribeBeacon(() => {
      if (!this.isConnected) return;
      if (!getActiveSession()) {
        if (!this._ending) {
          showToast('Timed sharing ended', { type: 'info' });
        }
        navigate('beacon-home');
        return;
      }
      this.render();
    });

    this.render();
    this._locationStatusTimer = setInterval(() => {
      this.updateAccuracyStatus();
      this.updateOffPathState();
    }, 5000);
    if (this._latestLocation) {
      this.updateMarkerPosition();
      this.updateOffPathState({ fromLocationUpdate: true });
    } else {
      requestCurrentLocation().catch((error) => this.reportLocationError(error));
    }
  }

  reportLocationError(error) {
    if (!this.isConnected || this._locationErrorShown) return;
    this._locationWatchError = error;
    this._locationErrorShown = true;
    this.updateAccuracyStatus();
    showToast(getLocationErrorMessage(error), { type: 'error' });
  }

  _routeNeedsLocationAnchor() {
    const session = getActiveSession();
    const firstPoint = session?.pathCoordinates?.[0];
    return session?.mode === 'path'
      && this._latestLocation
      && !this._resolvedRouteCoordinates
      && firstPoint
      && !Array.isArray(firstPoint)
      && !Number.isFinite(firstPoint.lat);
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._unsubscribeLocation) this._unsubscribeLocation();
    if (this._stopWatchingLocation) this._stopWatchingLocation();
    clearInterval(this._locationStatusTimer);
    this._offPathMonitor?.resetEvidence();
    this._map?.remove();
    this._map = null;
    super.disconnectedCallback();
  }

  updateMarkerPosition() {
    const session = getActiveSession();
    if (!this._positionMarker || !session) return;
    const location = this._latestLocation || getCurrentLocation();
    if (location) {
      const latLng = [location.lat, location.lng];
      this._positionMarker.setLatLng(latLng);
      this._accuracyCircle?.setLatLng(latLng);
      this._accuracyCircle?.setRadius(location.accuracy);
      this._positionMarker.setIcon(createBeaconDotIcon(session.isOffPath));
      if (session.isOffPath) {
        this._positionMarker.unbindTooltip();
        this._positionMarker.bindTooltip(`Off path · ${session.offPathDistance || '140 m'}`, {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: 'beacon-offpath-tooltip'
        });
      } else {
        this._positionMarker.unbindTooltip();
      }
      return;
    }

    if (session.isOffPath) {
      this._positionMarker.setIcon(createBeaconDotIcon(true));
      this._positionMarker.unbindTooltip();
      this._positionMarker.bindTooltip(`Off path · ${session.offPathDistance || '140 m'}`, {
        permanent: true,
        direction: 'top',
        offset: [0, -8],
        className: 'beacon-offpath-tooltip'
      });
    }
  }

  updateAccuracyStatus() {
    const status = this.querySelector('#bc-location-accuracy-status');
    const location = this._latestLocation;
    const session = getActiveSession();
    if (!status) return;
    if (
      session?.reducedAccuracy
      && location
      && location.accuracy < BEACON_PRECISE_ACCURACY_METERS
      && Date.now() - location.timestamp <= LOCATION_STALE_AFTER_MS
    ) {
      session.reducedAccuracy = false;
    }
    if (
      session?.reducedAccuracy
      && (!location || location.accuracy >= BEACON_PRECISE_ACCURACY_METERS)
    ) {
      const accuracyMeters = location?.accuracy ?? session.initialAccuracyMeters;
      const accuracy = Number.isFinite(accuracyMeters)
        ? ` (±${Math.round(accuracyMeters)} m)`
        : '';
      const updateError = this._locationWatchError
        ? ` Location updates unavailable: ${getLocationErrorMessage(this._locationWatchError)}`
        : '';
      status.textContent = `Reduced accuracy${accuracy}. Off-path alerts and automatic arrival detection may be unreliable or paused until a fresh fix under ${BEACON_PRECISE_ACCURACY_METERS} m.${updateError}`;
      status.hidden = false;
      return;
    }
    if (this._locationWatchError) {
      status.textContent = `Location updates unavailable. Off-path alerts are paused. ${getLocationErrorMessage(this._locationWatchError)}`;
      status.hidden = false;
      return;
    }
    if (!location) {
      status.textContent = 'Waiting for a location fix. Your live position and off-path alerts are not current.';
      status.hidden = false;
      return;
    }
    const ageMs = Date.now() - location.timestamp;
    if (ageMs > LOCATION_STALE_AFTER_MS) {
      const ageMinutes = Math.max(1, Math.round(ageMs / 60000));
      status.textContent = `Last location update was ${ageMinutes} min ago. Off-path alerts are paused until location updates resume.`;
      status.hidden = false;
    } else if (getBeaconAccuracyTier(location.accuracy) !== 'precise') {
      status.textContent = getBeaconAccuracyTier(location.accuracy) === 'reduced'
        ? `Reduced accuracy (about ${Math.round(location.accuracy)} m). Off-path alerts and automatic arrival detection are paused until a fix under ${BEACON_PRECISE_ACCURACY_METERS} m is available.`
        : `Location accuracy is over ${BEACON_MAX_REDUCED_ACCURACY_METERS} m (about ${Math.round(location.accuracy)} m). Safety alerts and automatic arrival detection are paused.`;
      status.hidden = false;
    } else {
      status.hidden = true;
      status.textContent = '';
    }
  }

  updateOffPathState({ fromLocationUpdate = false } = {}) {
    const session = getActiveSession();
    const location = this._latestLocation;
    if (!session) return;
    if (session?.pathCoordinates !== this._monitoredPathCoordinates) {
      this._offPathMonitor = resetOffPathMonitor(session);
      this._monitoredPathCoordinates = session?.pathCoordinates;
    }
    if (session?.offPathAlert !== true) {
      this._offPathMonitor.resetEvidence();
      if (session?.isOffPath) setSessionOffPath(false);
      return;
    }
    if (!this._map || !this._routeLatLngs || !location || session?.mode !== 'path') {
      this._offPathMonitor.resetEvidence();
      return;
    }
    if (
      location.accuracy >= BEACON_PRECISE_ACCURACY_METERS
      || Date.now() - location.timestamp > LOCATION_STALE_AFTER_MS
    ) {
      this._offPathMonitor.observe({
        distanceMeters: Number.NaN,
        accuracyMeters: location.accuracy
      });
      return;
    }
    if (!fromLocationUpdate) return;
    if (session.mode === 'path' && session.duration === 'Until I arrive') {
      const finalPoint = session.pathCoordinates?.[session.pathCoordinates.length - 1];
      const destination = Array.isArray(finalPoint)
        ? { lat: finalPoint[0], lng: finalPoint[1] }
        : finalPoint && Number.isFinite(finalPoint.lat) && Number.isFinite(finalPoint.lng)
          ? { lat: finalPoint.lat, lng: finalPoint.lng }
          : null;
      if (isWithinBeaconArrivalZone(location, destination)) {
        this._ending = true;
        stopActiveSession('arrived');
        showToast(`You have arrived at ${session.destination}.`, { type: 'success' });
        return;
      }
    }

    const position = this._map.latLngToLayerPoint([location.lat, location.lng]);
    let nearestDistance = Infinity;
    for (let index = 1; index < this._routeLatLngs.length; index++) {
      const start = this._map.latLngToLayerPoint(this._routeLatLngs[index - 1]);
      const end = this._map.latLngToLayerPoint(this._routeLatLngs[index]);
      const nearestPoint = L.LineUtil.closestPointOnSegment(position, start, end);
      const nearestLatLng = this._map.layerPointToLatLng(nearestPoint);
      nearestDistance = Math.min(
        nearestDistance,
        L.latLng([location.lat, location.lng]).distanceTo(nearestLatLng)
      );
    }

    const isOffPath = this._offPathMonitor.observe({
      distanceMeters: nearestDistance,
      accuracyMeters: location.accuracy,
      now: location.timestamp
    });
    if (session.isOffPath !== isOffPath) {
      setSessionOffPath(isOffPath, isOffPath ? nearestDistance : undefined);
    }
  }

  render() {
    this._map?.remove();
    this._map = null;
    clearChildren(this);
    const session = getActiveSession();
    if (!session) {
      navigate('beacon-home');
      return;
    }
    const state = getBeaconState();

    // 1. Full bleed map container
    const mapWrap = createElement('div', { cls: 'bc-map-wrap' });
    const map = createElement('div', {
      cls: 'bc-map',
      attrs: { 'aria-label': 'OpenStreetMap live route map' }
    });
    mapWrap.appendChild(map);
    this.appendChild(mapWrap);
    this._map = createBeaconMap(map, { zoom: 15 });

    if (this._resolvedRouteSource !== session.pathCoordinates) {
      this._resolvedRouteCoordinates = null;
      this._resolvedRouteSource = session.pathCoordinates;
    }
    const pathCoordinates = this._resolvedRouteCoordinates
      || (session.pathCoordinates?.length > 1
        ? session.pathCoordinates
      : [
          { x: 60, y: 430 },
          { x: 80, y: 360 },
          { x: 130, y: 340 },
          { x: 140, y: 280 },
          { x: 90, y: 200 },
          { x: 150, y: 160 },
          { x: 230, y: 120 },
          { x: 225, y: 70 }
        ]);
    const legacyPath = !Array.isArray(pathCoordinates[0])
      && !Number.isFinite(pathCoordinates[0]?.lat);
    if (legacyPath && this._latestLocation && !this._resolvedRouteCoordinates) {
      this._resolvedRouteCoordinates = rebasePathToLocation(pathCoordinates, this._latestLocation);
    }
    this._routeLatLngs = this._resolvedRouteCoordinates || mockPathToLatLngs(pathCoordinates);

    if (session.mode === 'path') {
      L.polyline(this._routeLatLngs, {
        color: '#1C8C99',
        opacity: 0.16,
        weight: 34,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this._map);
      L.polyline(this._routeLatLngs, {
        color: '#1C8C99',
        weight: 3,
        dashArray: '2 9',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this._map);
      L.marker(this._routeLatLngs[0], {
        icon: createBeaconDivIcon('Y', 'self'),
        title: 'Your starting location'
      }).addTo(this._map);
      L.marker(this._routeLatLngs[this._routeLatLngs.length - 1], {
        icon: createBeaconDivIcon('D', 'destination'),
        title: session.destination || 'Destination'
      }).addTo(this._map);
      this._map.fitBounds(this._routeLatLngs, { padding: [36, 36], maxZoom: 15 });
    } else if (this._latestLocation) {
      this._map.setView([this._latestLocation.lat, this._latestLocation.lng], 15);
    }

    this._positionMarker = null;
    this._accuracyCircle = null;
    if (this._latestLocation) {
      this._accuracyCircle = L.circle(
        [this._latestLocation.lat, this._latestLocation.lng],
        {
          radius: this._latestLocation.accuracy,
          color: '#1C8C99',
          weight: 1,
          opacity: 0.65,
          fillColor: '#1C8C99',
          fillOpacity: 0.12,
          interactive: false
        }
      ).addTo(this._map);
      this._positionMarker = L.marker(
        [this._latestLocation.lat, this._latestLocation.lng],
        {
          icon: createBeaconDotIcon(),
          title: 'Your current location',
          keyboard: true
        }
      ).addTo(this._map);
    }
    this._map.invalidateSize();

    // 5. Floating Session Card
    const card = createElement('section', {
      cls: 'bc-session-card',
      attrs: { 'aria-label': 'Active Beacon session', id: 'bc-session-card' }
    });

    const row = createElement('div', { cls: 'bcs-row' });
    const avatars = createElement('div', { cls: 'bcs-avatars' });

    // Show initials of members sharing with
    const sharingMembers = (session.memberIds || [])
      .map((id) => state.members.find((m) => m.id === id))
      .filter(Boolean);

    const memberNames = sharingMembers.map((m) => m.name.split(' ')[0]).join(', ');

    for (const m of sharingMembers) {
      const av = createElement('div', { cls: 'bc-avatar', text: m.initial });
      avatars.appendChild(av);
    }

    const textCol = createElement('div', { attrs: { style: 'flex: 1;' } });
    const title = createElement('div', {
      cls: 'bcs-title',
      text: sharingMembers.length
        ? `Sharing with ${memberNames}`
        : 'Sharing with selected circle members'
    });
    const sub = createElement('div', {
      cls: 'bcs-sub',
      text: session.mode === 'path'
        ? `Walk to ${session.destination} · ETA ${session.eta}`
        : 'Live location · Real-time'
    });
    textCol.append(title, sub);
    row.append(avatars, textCol);
    card.appendChild(row);
    const accuracyStatus = createElement('div', {
      cls: 'bc-location-accuracy-status',
      attrs: { id: 'bc-location-accuracy-status', role: 'status', 'aria-live': 'polite' }
    });
    accuracyStatus.hidden = true;
    card.appendChild(accuracyStatus);

    // Screen D2: Off-Path Alert Banner & Action Buttons
    if (session.isOffPath) {
      const banner = createElement('div', { cls: 'offpath-banner', attrs: { role: 'alert' } });
      banner.appendChild(BeaconIcons.warning(14, 'var(--amber, #BA7517)'));

      const bannerText = createElement('div', { cls: 'offpath-banner-text' });
      const bold = createElement('b', { text: 'You are off your path. ' });
      const rest = document.createTextNode(
        session.offPathAlert
          ? `${memberNames} have been notified.`
          : 'Your circle has not been notified.'
      );
      bannerText.append(bold, rest);
      banner.appendChild(bannerText);
      card.appendChild(banner);

      const btnRow = createElement('div', { cls: 'offpath-btn-row' });
      const updateBtn = createElement('button', {
        cls: 'offpath-update-btn',
        attrs: { type: 'button', id: 'bc-update-path-btn' },
        text: 'Update path'
      });
      updateBtn.onclick = () => {
        navigate('beacon-draw-path', { edit: 'true' });
      };

      const okBtn = createElement('button', {
        cls: 'offpath-ok-btn',
        attrs: { type: 'button', id: 'bc-offpath-ok-btn' },
        text: 'I am fine'
      });
      okBtn.onclick = () => {
        this._offPathMonitor.dismiss();
        setSessionOffPath(false);
        showToast('Off-path alert dismissed. Sharing continues.', { type: 'info' });
      };

      btnRow.append(updateBtn, okBtn);
      card.appendChild(btnRow);
    }

    // Stop sharing button
    const stopBtn = createElement('button', {
      cls: 'bcs-stop',
      attrs: { type: 'button', id: 'bc-stop-sharing-btn' },
      text: 'Stop sharing'
    });
    stopBtn.onclick = async () => {
      this._ending = true;
      await stopActiveSession();
      showToast('Location sharing stopped', { type: 'info' });
      navigate('beacon-home');
    };
    card.appendChild(stopBtn);
    this.appendChild(card);

    this.updateMarkerPosition();
    this.updateAccuracyStatus();
    this.updateOffPathState();
  }
}
customElements.define('page-beacon-share-session', PageBeaconShareSession);
