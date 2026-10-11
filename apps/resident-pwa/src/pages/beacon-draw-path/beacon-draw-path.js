/**
 * @file apps/resident-pwa/src/pages/beacon-draw-path/beacon-draw-path.js
 * Screen A3: Draw your path.
 * Interactive finger/pointer route drawing with real-time distance,
 * alert corridor preview, undo/clear controls, and accessible routing alternative.
 */

import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement, setText } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import {
  getActiveSession,
  getBeaconWalkingRoute,
  searchBeaconPlaces,
  setPendingBeaconPath,
  updateSessionPath
} from '../../features/beacon/beacon.client.js';
import {
  getCurrentLocation,
  getLocationErrorMessage,
  getSelectedBeaconRouteStart,
  clearSelectedBeaconRouteStart,
  MAX_BEACON_LOCATION_ACCURACY_METERS,
  requestCurrentLocation,
  subscribeCurrentLocation
} from '../../features/beacon/beacon-location.js';
import {
  createBeaconDivIcon,
  createBeaconMap,
  mockPathToLatLngs,
  L
} from '../../features/beacon/leaflet-map.js';
import { navigate } from '../../router.js';

function hasReliableLocation(location) {
  return Boolean(
    location
    && location.accuracy <= MAX_BEACON_LOCATION_ACCURACY_METERS
  );
}

function simplifyPath(points, toleranceMeters = 5) {
  if (points.length <= 2) return points;
  const referenceLatitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const metersPerLatitudeDegree = 111320;
  const metersPerLongitudeDegree = metersPerLatitudeDegree * Math.cos(referenceLatitude * Math.PI / 180);
  const squaredTolerance = toleranceMeters ** 2;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [firstIndex, lastIndex] = stack.pop();
    const first = points[firstIndex];
    const last = points[lastIndex];
    const dx = (last[1] - first[1]) * metersPerLongitudeDegree;
    const dy = (last[0] - first[0]) * metersPerLatitudeDegree;
    const segmentLengthSquared = dx * dx + dy * dy;
    let maximumDistance = squaredTolerance;
    let farthestIndex = -1;

    for (let index = firstIndex + 1; index < lastIndex; index++) {
      const point = points[index];
      const pointX = (point[1] - first[1]) * metersPerLongitudeDegree;
      const pointY = (point[0] - first[0]) * metersPerLatitudeDegree;
      const progress = segmentLengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, (pointX * dx + pointY * dy) / segmentLengthSquared));
      const offsetX = pointX - progress * dx;
      const offsetY = pointY - progress * dy;
      const distanceSquared = offsetX * offsetX + offsetY * offsetY;
      if (distanceSquared > maximumDistance) {
        maximumDistance = distanceSquared;
        farthestIndex = index;
      }
    }

    if (farthestIndex >= 0) {
      keep[farthestIndex] = 1;
      stack.push([firstIndex, farthestIndex], [farthestIndex, lastIndex]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

function limitPathPoints(points, maxPoints = 500) {
  const simplified = simplifyPath(points);
  if (simplified.length <= maxPoints) return simplified;
  const lastIndex = simplified.length - 1;
  return Array.from({ length: maxPoints }, (_, index) => (
    simplified[Math.round((index * lastIndex) / (maxPoints - 1))]
  ));
}

export class PageBeaconDrawPath extends BaseElement {
  init(params) {
    this._params = params || {};
    this._isEditMode = this._params?.edit === 'true';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-draw-page');

    // Default reference start location
    this._points = [];
    this._pathHistory = [];
    this._isDrawing = false;
    this._destination = 'Selected destination';
    this._distanceKm = 0;
    this._distanceMeters = 0;
    this._timeMin = 0;
    this._hasPath = false;
    this._routeIsMock = false;
    this._accessibleRouteMode = false;
    const selectedRouteStart = getSelectedBeaconRouteStart();
    this._manualStartPos = selectedRouteStart
      ? [selectedRouteStart.lat, selectedRouteStart.lng]
      : null;
    if (selectedRouteStart) clearSelectedBeaconRouteStart();
    this._selectingStartPosition = false;
    this._routeRequestId = 0;

    // Check if editing active session
    const active = getActiveSession();
    if (this._isEditMode && active && active.pathCoordinates?.length) {
      this._points = mockPathToLatLngs(active.pathCoordinates);
      this._hasPath = true;
      this._distanceKm = parseFloat(active.distance) || 1.4;
      this._timeMin = parseInt(active.timeEstimate, 10) || 18;
      this.calculateLiveDistance();
    }
    const location = getCurrentLocation();
    this._startPos = this._points[0] || this._manualStartPos || (
      hasReliableLocation(location) ? [location.lat, location.lng] : null
    );

    this._unsubscribeLocation = subscribeCurrentLocation((location) => {
      if (!this.isConnected || this._isDrawing) return;
      if (!this._hasPath && !this._manualStartPos && !this._selectingStartPosition && hasReliableLocation(location)) {
        this._startPos = [location.lat, location.lng];
        this._map?.setView(this._startPos, 15);
      }
      this.updateHintAndButtons();
    });
    this.render();
    if (!this._isEditMode && !hasReliableLocation(getCurrentLocation())) {
      requestCurrentLocation({ force: true }).catch((error) => {
        if (this.isConnected) showToast(getLocationErrorMessage(error), { type: 'error' });
      });
    }
  }

  disconnectedCallback() {
    if (this._unsubscribeLocation) this._unsubscribeLocation();
    this._map?.remove();
    this._map = null;
    super.disconnectedCallback();
  }

  render() {
    this._map?.remove();
    this._map = null;
    clearChildren(this);

    // 1. Map container
    const mapWrap = createElement('div', { cls: 'draw-map-wrap' });
    const map = createElement('div', {
      cls: 'bc-map',
      attrs: { 'aria-label': 'OpenStreetMap route map', id: 'draw-leaflet-map' }
    });
    mapWrap.appendChild(map);
    this.appendChild(mapWrap);
    this._map = createBeaconMap(map, { interactive: true, zoom: 15 });
    const location = getCurrentLocation();
    if (this._hasPath && this._points.length > 1) {
      this._map.fitBounds(this._points, { padding: [36, 36], maxZoom: 15 });
    } else if (hasReliableLocation(location)) {
      this._map.setView([location.lat, location.lng], 15);
    } else if (!this._manualStartPos) {
      this._map.setView([0, 0], 2);
    }

    // 2. Transparent pointer layer for route drawing
    const drawingCanvas = createElement('div', {
      cls: 'draw-pointer-layer',
      attrs: { id: 'draw-canvas', 'aria-label': 'Draw a route on the map' }
    });
    mapWrap.appendChild(drawingCanvas);

    const zoomControls = createElement('div', {
      cls: 'draw-map-zoom-controls',
      attrs: { 'aria-label': 'Map zoom controls' }
    });
    const zoomInBtn = createElement('button', {
      cls: 'draw-map-zoom-btn',
      attrs: { type: 'button', 'aria-label': 'Zoom in' },
      text: '+'
    });
    zoomInBtn.onclick = () => this._map.zoomIn();
    const zoomOutBtn = createElement('button', {
      cls: 'draw-map-zoom-btn',
      attrs: { type: 'button', 'aria-label': 'Zoom out' },
      text: '−'
    });
    zoomOutBtn.onclick = () => this._map.zoomOut();
    zoomControls.append(zoomInBtn, zoomOutBtn);
    mapWrap.appendChild(zoomControls);

    this._map.invalidateSize();
    if (this._hasPath && this._points.length > 1) {
      this._map.fitBounds(this._points, { padding: [36, 36], maxZoom: 15 });
    }

    // 3. Floating top bar
    const topbar = createElement('div', { cls: 'draw-topbar' });
    const backBtn = createElement('button', {
      cls: 'draw-back-btn',
      attrs: { type: 'button', 'aria-label': 'Go back', id: 'draw-back-btn' }
    });
    backBtn.appendChild(BeaconIcons.back(14));
    backBtn.onclick = () => this.handleBack();

    const titlePill = createElement('div', { cls: 'draw-title-pill' });
    titlePill.appendChild(BeaconIcons.pencil(13, 'var(--beacon, #1C8C99)'));
    titlePill.appendChild(createElement('span', { text: this._isEditMode ? 'Update your path' : 'Draw your path' }));
    topbar.append(backBtn, titlePill);
    this.appendChild(topbar);

    // 4. Hint / summary card
    this._hintCard = createElement('div', { cls: 'draw-hint-card', attrs: { role: 'status' } });
    this._hintTitle = createElement('div', { cls: 'draw-hint-title' });
    this._hintBody = createElement('div', { cls: 'draw-hint-body' });
    this._a11yBtn = createElement('button', {
      cls: 'draw-hint-a11y-btn',
      attrs: {
        type: 'button',
        'aria-expanded': 'false',
        'aria-controls': 'draw-accessible-route-panel',
        id: 'draw-accessible-route-toggle'
      },
      text: 'Set destination instead'
    });
    this._a11yBtn.onclick = () => this.toggleAccessibleRoute();
    this._accessibleRoutePanel = createElement('div', {
      cls: 'draw-accessible-route',
      attrs: { id: 'draw-accessible-route-panel', hidden: '' }
    });
    const searchForm = createElement('form', { cls: 'draw-place-search' });
    this._placeSearchInput = createElement('input', {
      attrs: {
        type: 'search',
        name: 'destination',
        placeholder: 'Search for a place',
        'aria-label': 'Search for a destination'
      }
    });
    this._placeSearchInput.maxLength = 120;
    const searchBtn = createElement('button', {
      cls: 'draw-place-search-btn',
      attrs: { type: 'submit' },
      text: 'Search'
    });
    searchForm.append(this._placeSearchInput, searchBtn);
    searchForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.searchAccessibleDestinations();
    });
    this._placeSearchResults = createElement('div', {
      cls: 'draw-place-results',
      attrs: { role: 'listbox', 'aria-label': 'Destination search results' }
    });
    this._placeSearchStatus = createElement('div', {
      cls: 'draw-place-search-status',
      attrs: { role: 'status', 'aria-live': 'polite' }
    });
    this._accessibleRoutePanel.append(searchForm, this._placeSearchResults, this._placeSearchStatus);
    this._locationRetryBtn = createElement('button', {
      cls: 'draw-hint-retry-btn',
      attrs: { type: 'button' },
      text: 'Retry location'
    });
    this._manualStartBtn = createElement('button', {
      cls: 'draw-hint-manual-start-btn',
      attrs: { type: 'button' },
      text: 'Choose start on map'
    });
    this._manualStartBtn.onclick = () => this.chooseManualStart();
    this._locationRetryBtn.onclick = () => {
      this._locationRetryBtn.disabled = true;
      this._locationRetryBtn.textContent = 'Finding location…';
      requestCurrentLocation({ force: true }).catch((error) => {
        if (this.isConnected) showToast(getLocationErrorMessage(error), { type: 'error' });
      }).finally(() => {
        if (this.isConnected) {
          this._locationRetryBtn.disabled = false;
          this._locationRetryBtn.textContent = 'Retry location';
        }
      });
    };

    this._hintCard.append(
      this._hintTitle,
      this._hintBody,
      this._locationRetryBtn,
      this._manualStartBtn,
      this._a11yBtn,
      this._accessibleRoutePanel
    );
    this.appendChild(this._hintCard);

    // 5. Toolbar at bottom
    const toolbar = createElement('div', { cls: 'draw-toolbar' });
    const legendRow = createElement('div', { cls: 'draw-legend-row' });
    const swatch = createElement('span', { cls: 'draw-legend-swatch' });
    const legendText = createElement('span', { text: 'Alert zone · 100 m either side of your path' });
    legendRow.append(swatch, legendText);

    const btnRow = createElement('div', { cls: 'draw-btn-row' });
    this._undoBtn = createElement('button', {
      cls: 'draw-btn',
      attrs: { type: 'button', id: 'draw-undo-btn' }
    });
    this._undoBtn.appendChild(BeaconIcons.undo(12));
    this._undoBtn.appendChild(createElement('span', { text: 'Undo' }));
    this._undoBtn.onclick = () => this.handleUndo();

    this._clearBtn = createElement('button', {
      cls: 'draw-btn',
      attrs: { type: 'button', id: 'draw-clear-btn' }
    });
    this._clearBtn.appendChild(BeaconIcons.clear(12));
    this._clearBtn.appendChild(createElement('span', { text: 'Clear' }));
    this._clearBtn.onclick = () => this.handleClear();

    this._nextBtn = createElement('button', {
      cls: ['draw-btn', 'primary'],
      attrs: { type: 'button', id: 'draw-next-btn' },
      text: this._isEditMode ? 'Save path' : 'Next'
    });
    this._nextBtn.onclick = () => this.handleNext();

    btnRow.append(this._undoBtn, this._clearBtn, this._nextBtn);
    toolbar.append(legendRow, btnRow);
    this.appendChild(toolbar);

    // Initialize Leaflet route layers and pointer interaction
    this.updateRouteLayers();
    this.updateHintAndButtons();
    this.setupDrawingInteraction(drawingCanvas);
  }

  setupDrawingInteraction(canvas) {
    this._drawingCanvas = canvas;
    const getPosition = (e) => {
      const rect = canvas.getBoundingClientRect();
      return this._map.containerPointToLatLng([
        e.clientX - rect.left,
        e.clientY - rect.top
      ]);
    };

    const startDraw = (e) => {
      if (!e.isPrimary) {
        this._isDrawing = false;
        this._destinationTouch = null;
        this._activePointerId = null;
        this._map.dragging.enable();
        if (this._strokeBasePoints) {
          this._points = this._strokeBasePoints;
          this._hasPath = this._points.length > 1;
          this._strokeBasePoints = null;
        }
        this.updateRouteLayers();
        this.updateHintAndButtons();
        return;
      }
      e.preventDefault();
      const pos = getPosition(e);
      if (this._selectingStartPosition) {
        this.setManualStartPosition(pos);
        return;
      }
      if (this._accessibleRouteMode) {
        canvas.setPointerCapture?.(e.pointerId);
        this._activePointerId = e.pointerId;
        this._destinationTouch = { lat: pos.lat, lng: pos.lng };
        return;
      }
      const location = getCurrentLocation();
      const startPosition = this._manualStartPos
        || (hasReliableLocation(location) ? [location.lat, location.lng] : null);
      const previousPoints = this._hasPath && !this._routeIsMock
        ? this._points.map((point) => [...point])
        : [];
      if (!previousPoints.length && !startPosition) {
        showToast('Retry location or choose your route starting point on the map.', { type: 'error' });
        return;
      }
      this._startPos = previousPoints.length
        ? previousPoints[previousPoints.length - 1]
        : startPosition;
      if (L.latLng(this._startPos).distanceTo(pos) > 30) {
        showToast(previousPoints.length
          ? 'Start drawing near the destination pin to extend your path.'
          : this._manualStartPos
            ? 'Start drawing near the selected route-start pin.'
            : 'Start drawing near the “You are here” marker. Your path will begin at your current location.', { type: 'info' });
        return;
      }
      this._isDrawing = true;
      this._map.dragging.disable();
      this._strokeBasePoints = previousPoints;
      this._points = [...previousPoints, this._startPos];
      this._hasPath = false;
      this._routeIsMock = false;
      this._distanceMeters = 0;
      this._distanceKm = 0;
      this._timeMin = 0;
      canvas.setPointerCapture?.(e.pointerId);
      this._activePointerId = e.pointerId;
      this.updateRouteLayers();
      this.updateHintAndButtons();
    };

    const moveDraw = (e) => {
      if (!this._isDrawing || e.pointerId !== this._activePointerId) return;
      e.preventDefault();
      const pos = getPosition(e);
      this._points.push([pos.lat, pos.lng]);
      if (this._points.length > 2000) {
        this._points = Array.from({ length: 1000 }, (_, index) => (
          this._points[Math.round((index * (this._points.length - 1)) / 999)]
        ));
      }
      this.calculateLiveDistance();
      this.updateRouteLayers();
      this.updateHintAndButtons();
    };

    const endDraw = (e) => {
      if (e.pointerId !== this._activePointerId) return;
      if (this._accessibleRouteMode && this._destinationTouch) {
        const destination = this._destinationTouch;
        this._destinationTouch = null;
        this._activePointerId = null;
        if (e.type !== 'pointercancel') {
          this.setAccessibleDestination({
            id: 'map-pin',
            name: 'Map destination',
            lat: destination.lat,
            lng: destination.lng
          });
        }
        return;
      }
      if (!this._isDrawing) return;
      this._isDrawing = false;
      this._activePointerId = null;
      this._map.dragging.enable();
      if (e.type === 'pointercancel') {
        this._points = this._strokeBasePoints || [];
        this._hasPath = this._points.length > 1;
      } else if (this._points.length > (this._strokeBasePoints?.length || 0) + 1) {
        this._points = limitPathPoints(this._points);
        this._pathHistory.push(this._strokeBasePoints || []);
        this._hasPath = true;
        this.calculateLiveDistance();
      } else {
        this._points = this._strokeBasePoints || [];
        this._hasPath = this._points.length > 1;
      }
      this._strokeBasePoints = null;
      this.updateRouteLayers();
      this.updateHintAndButtons();
    };

    canvas.addEventListener('pointerdown', startDraw);
    canvas.addEventListener('pointermove', moveDraw);
    canvas.addEventListener('pointerup', endDraw);
    canvas.addEventListener('pointercancel', endDraw);
  }

  chooseManualStart() {
    if (this._selectingStartPosition) return;
    this._selectingStartPosition = true;
    this._manualStartBtn.textContent = 'Tap the map to set start…';
    this._drawingCanvas.style.pointerEvents = 'none';
    this._map.dragging.enable();
    this._map.once('click', (event) => {
      if (!this.isConnected || !this._selectingStartPosition) return;
      this.setManualStartPosition(event.latlng);
    });
    this.updateHintAndButtons();
  }

  setManualStartPosition(position) {
    this._manualStartPos = [position.lat, position.lng];
    this._startPos = this._manualStartPos;
    this._selectingStartPosition = false;
    this._drawingCanvas.style.pointerEvents = 'auto';
    this._map.dragging.disable();
    if (this._hasPath) this.clearPath();
    this.updateRouteLayers();
    this.updateHintAndButtons();
  }

  calculateLiveDistance() {
    if (this._points.length < 2) return;
    let distanceMeters = 0;
    for (let i = 1; i < this._points.length; i++) {
      distanceMeters += L.latLng(this._points[i - 1]).distanceTo(L.latLng(this._points[i]));
    }
    this._distanceMeters = distanceMeters;
    const km = distanceMeters / 1000;
    this._distanceKm = parseFloat(km.toFixed(1));
    this._timeMin = Math.round((this._distanceKm / 4.5) * 60) || 1;
  }

  toggleAccessibleRoute() {
    this._accessibleRouteMode = !this._accessibleRouteMode;
    this._accessibleRoutePanel.hidden = !this._accessibleRouteMode;
    this._a11yBtn.setAttribute('aria-expanded', String(this._accessibleRouteMode));
    this._placeSearchStatus.textContent = this._accessibleRouteMode
      ? 'Search for a place, or tap the map to choose a destination.'
      : '';
  }

  async searchAccessibleDestinations() {
    const query = this._placeSearchInput.value.trim();
    if (query.length < 2) {
      this._placeSearchStatus.textContent = 'Enter at least 2 characters to search.';
      this._placeSearchInput.focus();
      return;
    }

    const requestId = ++this._routeRequestId;
    this._placeSearchResults.replaceChildren();
    this._placeSearchStatus.textContent = 'Searching places…';
    try {
      const { places, mock } = await searchBeaconPlaces(query);
      if (!this.isConnected || requestId !== this._routeRequestId) return;
      if (places.length === 0) {
        this._placeSearchStatus.textContent = 'No matching places were found.';
        return;
      }
      for (const place of places) {
        const result = createElement('button', {
          cls: 'draw-place-result',
          attrs: { type: 'button', role: 'option' },
          text: place.name
        });
        result.onclick = () => this.setAccessibleDestination(place);
        this._placeSearchResults.appendChild(result);
      }
      this._placeSearchStatus.textContent = mock
        ? 'Demo places shown. A configured routing service is required for a real route.'
        : `${places.length} destination${places.length === 1 ? '' : 's'} found.`;
    } catch (error) {
      if (!this.isConnected || requestId !== this._routeRequestId) return;
      this._placeSearchStatus.textContent = error.message || 'Place search is unavailable. Please try again.';
    }
  }

  async setAccessibleDestination(destination) {
    const location = getCurrentLocation();
    const startPosition = this._manualStartPos
      || (hasReliableLocation(location) ? [location.lat, location.lng] : null);
    if (!startPosition) {
      this._placeSearchStatus.textContent = 'Choose a start point on the map or use Retry location before planning a route.';
      return;
    }

    const requestId = ++this._routeRequestId;
    this._placeSearchStatus.textContent = `Planning a walking route to ${destination.name}…`;
    try {
      const route = await getBeaconWalkingRoute(
        { lat: startPosition[0], lng: startPosition[1] },
        { lat: destination.lat, lng: destination.lng }
      );
      if (!this.isConnected || requestId !== this._routeRequestId) return;
      if (route.distanceMeters < 100 || route.distanceMeters > 10000) {
        throw new Error('Choose a destination between 100 m and 10 km away.');
      }
      this._pathHistory.push(this._points.map((point) => [...point]));
      this._points = limitPathPoints(route.coordinates);
      this._startPos = this._points[0];
      this._destination = destination.name;
      this._distanceMeters = route.distanceMeters;
      this._distanceKm = parseFloat((route.distanceMeters / 1000).toFixed(1));
      this._timeMin = Math.max(1, Math.round(route.durationSeconds / 60));
      this._routeIsMock = route.mock;
      this._hasPath = true;
      this._placeSearchStatus.textContent = route.mock
        ? 'Demo route only. Configure the private routing service before sharing a route.'
        : `Route ready: ${this._distanceKm} km, about ${this._timeMin} min.`;
      this._map.fitBounds(this._points, { padding: [36, 36], maxZoom: 15 });
      this.updateRouteLayers();
      this.updateHintAndButtons();
    } catch (error) {
      if (!this.isConnected || requestId !== this._routeRequestId) return;
      this._placeSearchStatus.textContent = error.message || 'A route could not be planned. Please try another destination.';
    }
  }

  updateRouteLayers() {
    (this._routeLayers || []).forEach((layer) => this._map.removeLayer(layer));
    this._routeLayers = [];
    if (!this._points || this._points.length < 2) {
    const location = getCurrentLocation();
    const startPosition = this._manualStartPos
      || (hasReliableLocation(location) ? [location.lat, location.lng] : null);
    if (startPosition) {
      const isManual = Boolean(this._manualStartPos);
      const start = L.marker(startPosition, {
        icon: createBeaconDivIcon(isManual ? 'S' : 'Y', 'self'),
        title: isManual ? 'Selected route starting point' : 'Your current location'
      }).addTo(this._map);
      start.bindTooltip(isManual ? 'Selected route start' : 'You are here', { direction: 'bottom', offset: [0, 16] });
      this._routeLayers.push(start);
    }
    return;
    }

    const latitude = this._points.reduce((sum, point) => sum + point[0], 0) / this._points.length;
    const metersPerPixel = 156543.03392 * Math.cos(latitude * Math.PI / 180) / (2 ** this._map.getZoom());
    const corridor = L.polyline(this._points, {
      color: '#1C8C99',
      opacity: 0.16,
      weight: 200 / metersPerPixel,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(this._map);
    const route = L.polyline(this._points, {
      color: '#1C8C99',
      weight: 4,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(this._map);
    const start = L.marker(this._points[0], {
      icon: createBeaconDivIcon(this._manualStartPos ? 'S' : 'Y', 'self'),
      title: this._manualStartPos ? 'Selected route starting point' : 'Your starting location'
    }).addTo(this._map);
    start.bindTooltip(this._manualStartPos ? 'Selected route start' : 'You are here', { direction: 'bottom', offset: [0, 16] });
    const destination = L.marker(this._points[this._points.length - 1], {
      icon: createBeaconDivIcon('D', 'destination'),
      title: this._destination
    }).addTo(this._map);
    this._routeLayers.push(corridor, route, start, destination);
  }

  updateHintAndButtons() {
    const location = getCurrentLocation();
    const locationNeedsImprovement = !this._isEditMode
      && (!location || location.accuracy > MAX_BEACON_LOCATION_ACCURACY_METERS);
    const canDrawFromManualStart = Boolean(this._manualStartPos);
    this._locationRetryBtn.hidden = !locationNeedsImprovement;
    this._manualStartBtn.hidden = this._isEditMode
      || (!locationNeedsImprovement && !canDrawFromManualStart);
    this._manualStartBtn.textContent = this._selectingStartPosition
      ? 'Tap the map to set start…'
      : canDrawFromManualStart ? 'Change start on map' : 'Choose start on map';
    this._manualStartBtn.disabled = this._selectingStartPosition;
    this._nextBtn.disabled = !this._hasPath
      || (locationNeedsImprovement && !canDrawFromManualStart)
      || this._distanceMeters < 100
      || this._distanceMeters > 10000
      || this._routeIsMock;
    if (this._selectingStartPosition) {
      setText(this._hintTitle, 'Choose your route start');
      setText(this._hintBody, 'Pan or zoom the map, then tap where you are. Beacon will still verify your live location before sharing.');
      this._undoBtn.disabled = !this._hasPath || this._pathHistory.length === 0;
      this._clearBtn.disabled = !this._hasPath;
      return;
    }
    if (canDrawFromManualStart && this._isDrawing) {
      setText(this._hintTitle, `${this._distanceKm} km so far`);
      setText(this._hintBody, 'Drawing path corridor... lift your finger when you reach your destination.');
    } else if (canDrawFromManualStart && this._hasPath) {
      const rangeHint = this._distanceMeters < 100
        ? 'Draw at least 100 m before continuing.'
        : this._distanceMeters > 10000
          ? 'Beacon paths must be 10 km or shorter.'
          : 'Beacon will verify your live location before sharing.';
      setText(this._hintTitle, `Path drawn · ${this._distanceKm} km · about ${this._timeMin} min`);
      setText(this._hintBody, `Start selected on map. ${rangeHint}`);
    } else if (canDrawFromManualStart) {
      setText(this._hintTitle, 'Route start selected');
      setText(this._hintBody, 'Your start pin was chosen on the map. Beacon will verify your live location before sharing.');
    } else if (!location) {
      setText(this._hintTitle, 'Finding your location');
      setText(this._hintBody, 'Allow location access so your route starts where you are.');
    } else if (locationNeedsImprovement) {
      setText(this._hintTitle, 'Location accuracy is low');
      setText(this._hintBody, `Your device reports an approximate location${location ? ` (about ${Math.round(location.accuracy / 1000)} km accuracy)` : ''}. Retry for a GPS fix, or choose your route start on the map. Live sharing still requires an accurate location.`);
    } else if (this._isDrawing) {
      setText(this._hintTitle, `${this._distanceKm} km so far`);
      setText(this._hintBody, 'Drawing path corridor... lift your finger when you reach your destination.');
    } else if (this._hasPath) {
      const routeLabel = this._routeIsMock ? 'Demo route' : 'Path drawn';
      setText(this._hintTitle, `${routeLabel} · ${this._distanceKm} km · about ${this._timeMin} min`);
      setText(this._hintBody, this._routeIsMock
        ? 'This is sample routing data. Use freehand drawing or connect the private routing service before sharing.'
        : (this._distanceMeters < 100
          ? 'Draw at least 100 m before continuing.'
          : (this._distanceMeters > 10000
            ? 'Beacon paths must be 10 km or shorter.'
            : (this._accessibleRouteMode
              ? 'The shaded strip is the alert zone. Tap the map or search for another destination to replace this route.'
              : 'Drag your finger from where you are to where you are going. Lift to finish. The shaded strip is the alert zone.'))));
    } else {
      setText(this._hintTitle, 'Draw your path');
      setText(this._hintBody, 'Drag your finger from where you are to where you are going. Lift to finish.');
    }

    this._undoBtn.disabled = !this._hasPath || this._pathHistory.length === 0;
    this._clearBtn.disabled = !this._hasPath;
    this._undoBtn.disabled = !this._hasPath || this._pathHistory.length === 0;
    this._clearBtn.disabled = !this._hasPath;
  }

  handleUndo() {
    if (!this._pathHistory.length) return;
    this._points = this._pathHistory.pop();
    this._hasPath = this._points.length > 1;
    this._routeIsMock = false;
    if (this._hasPath) {
      this.calculateLiveDistance();
    } else {
      this._distanceMeters = 0;
      this._distanceKm = 0;
      this._timeMin = 0;
    }
    this.updateRouteLayers();
    this.updateHintAndButtons();
  }

  handleClear() {
    if (!this._hasPath) return;
    this.showClearDialog();
  }

  clearPath() {
    this._points = [];
    this._pathHistory = [];
    this._hasPath = false;
    this._routeIsMock = false;
    this._distanceMeters = 0;
    this._distanceKm = 0;
    this._timeMin = 0;
    this._placeSearchResults?.replaceChildren();
    this._placeSearchStatus.textContent = '';
    this.updateRouteLayers();
    this.updateHintAndButtons();
  }

  showClearDialog() {
    const backdrop = createElement('div', { cls: 'draw-dialog-backdrop' });
    const dialog = createElement('div', { cls: 'draw-dialog', attrs: { role: 'alertdialog', 'aria-modal': 'true' } });
    const title = createElement('div', { cls: 'draw-dialog-title', text: 'Clear your path?' });
    const body = createElement('div', {
      cls: 'draw-dialog-body',
      text: 'This removes the route from the map. You can draw a new path afterwards.'
    });
    const btnRow = createElement('div', { cls: 'btn-row' });
    const keepBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button' },
      text: 'Keep drawing'
    });
    keepBtn.onclick = () => backdrop.remove();
    const clearBtn = createElement('button', {
      cls: ['btn-flat', 'danger'],
      attrs: { type: 'button' },
      text: 'Clear path'
    });
    clearBtn.onclick = () => {
      backdrop.remove();
      this.clearPath();
    };
    btnRow.append(keepBtn, clearBtn);
    dialog.append(title, body, btnRow);
    backdrop.appendChild(dialog);
    this.appendChild(backdrop);
    keepBtn.focus();
  }

  handleBack() {
    if (this._hasPath) {
      this.showDiscardDialog();
    } else {
      // A3 Back without a path → A2 Share Mode Chooser
      navigate('beacon-home', { mode: 'choose' });
    }
  }

  showDiscardDialog() {
    const backdrop = createElement('div', { cls: 'draw-dialog-backdrop' });
    const dialog = createElement('div', { cls: 'draw-dialog' });
    const title = createElement('div', { cls: 'draw-dialog-title', text: 'Discard your path?' });
    const body = createElement('div', {
      cls: 'draw-dialog-body',
      text: 'If you leave now, the route you drew will be cleared.'
    });

    const btnRow = createElement('div', { cls: 'btn-row' });
    const keepBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button' },
      text: 'Keep drawing'
    });
    keepBtn.onclick = () => backdrop.remove();

    const discardBtn = createElement('button', {
      cls: ['btn-flat', 'danger'],
      attrs: { type: 'button' },
      text: 'Discard'
    });
    discardBtn.onclick = () => {
      backdrop.remove();
      // A3 Discard → A2 Share Mode Chooser
      navigate('beacon-home', { mode: 'choose' });
    };

    btnRow.append(keepBtn, discardBtn);
    dialog.append(title, body, btnRow);
    backdrop.appendChild(dialog);
    this.appendChild(backdrop);
  }

  handleNext() {
    if (this._routeIsMock) {
      showToast('A real walking route is required before you can share this path.', { type: 'error' });
      return;
    }
    if (this._isEditMode) {
      updateSessionPath(this._points, `${this._distanceKm} km`, `${this._timeMin} min`);
      navigate('beacon-share-session');
    } else {
      try {
        setPendingBeaconPath(this._points);
      } catch (error) {
        showToast(error.message || 'Your route could not be saved. Please try again.', { type: 'error' });
        return;
      }
      navigate('beacon-start-confirm', {
        mode: 'path',
        destination: this._destination,
        distance: `${this._distanceKm} km`,
        time: `${this._timeMin} min`
      });
    }
  }
}
customElements.define('page-beacon-draw-path', PageBeaconDrawPath);
