/**
 * @file apps/resident-pwa/src/components/map-pin-picker/map-pin-picker.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { config } from '../../config.js';
import { createBeaconMap, L } from '../../features/beacon/leaflet-map.js';

export class CnMapPinPicker extends BaseElement {
  constructor() {
    super();
    this._coordinates = null;
    this._address = '';
    this._map = null;
    this._marker = null;
    this._returnFocus = null;
    this._hasOpened = false;
    this._locationRevision = 0;
  }

  set address(value) {
    this._address = typeof value === 'string' ? value : '';
    if (this._addressInput) this._addressInput.value = this._address;
  }

  get coordinates() {
    if (!this._coordinates) return null;
    return {
      ...this._coordinates,
      address: this._address.trim() || 'Pinned location'
    };
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this._map?.remove();
    this._map = null;
    clearChildren(this);
    this.classList.add('cn-map-pin-picker');

    const modal = this.getAttribute('mode') === 'modal';
    const content = createElement('section', {
      cls: modal ? 'cn-map-pin-picker__content' : 'cn-map-pin-picker__inline',
      attrs: modal ? { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cn-map-pin-picker-title', tabindex: '-1' } : {}
    });
    if (modal) {
      const heading = createElement('h2', {
        cls: 'cn-map-pin-picker__title',
        text: 'Choose a location',
        attrs: { id: 'cn-map-pin-picker-title' }
      });
      const closeButton = createElement('button', {
        cls: 'cn-map-pin-picker__close',
        text: 'Close',
        attrs: { type: 'button', 'aria-label': 'Close location picker' }
      });
      closeButton.addEventListener('click', () => this.close());
      const header = createElement('div', { cls: 'cn-map-pin-picker__header' });
      header.append(heading, closeButton);
      content.appendChild(header);
    }

    const map = createElement('div', {
      cls: 'cn-map-pin-picker__map',
      attrs: { role: 'application', 'aria-label': 'OpenStreetMap location picker. Drag the pin or tap the map to adjust it.' }
    });
    const addressLabel = createElement('label', {
      cls: 'cn-map-pin-picker__label',
      text: 'Nearby address or landmark (optional)'
    });
    const addressInput = createElement('input', {
      cls: 'cn-map-pin-picker__address',
      attrs: {
        type: 'text',
        autocomplete: 'street-address',
        placeholder: 'Street, suburb, or nearby landmark'
      }
    });
    addressInput.value = this._address;
    addressInput.addEventListener('input', () => {
      this._address = addressInput.value;
    });
    addressLabel.appendChild(addressInput);
    this._addressInput = addressInput;

    const locateButton = createElement('button', {
      cls: 'cn-btn cn-btn--secondary cn-map-pin-picker__button',
      text: 'Use my current location',
      attrs: { type: 'button' }
    });
    const controls = createElement('div', { cls: 'cn-map-pin-picker__controls' });
    const status = createElement('p', {
      cls: 'cn-map-pin-picker__status',
      text: this._coordinates
        ? 'Location selected.'
        : 'Drag the pin or tap the map to choose a location.',
      attrs: { role: 'status', 'aria-live': 'polite' }
    });
    this._status = status;

    locateButton.addEventListener('click', () => this._locate(locateButton));
    controls.appendChild(locateButton);

    if (modal) {
      const actions = createElement('div', { cls: 'cn-map-pin-picker__actions' });
      const cancelButton = createElement('button', {
        cls: 'cn-btn cn-btn--secondary cn-map-pin-picker__button',
        text: 'Cancel',
        attrs: { type: 'button' }
      });
      const confirmButton = createElement('button', {
        cls: 'cn-btn cn-btn--primary cn-map-pin-picker__button',
        text: 'Use this location',
        attrs: { type: 'button' }
      });
      cancelButton.addEventListener('click', () => this.close());
      confirmButton.addEventListener('click', () => {
        if (!this._coordinates) {
          status.textContent = 'Drag the pin or tap the map to choose a location first.';
          return;
        }
        this.dispatchEvent(new CustomEvent('location-selected', {
          detail: this.coordinates,
          bubbles: true,
          composed: true
        }));
        this.close();
      });
      actions.append(cancelButton, confirmButton);
      content.append(map, addressLabel, controls, status, actions);

      const backdrop = createElement('div', {
        cls: 'cn-map-pin-picker__backdrop',
        attrs: { hidden: '' }
      });
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) this.close();
      });
      backdrop.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') this.close();
      });
      backdrop.appendChild(content);
      this._backdrop = backdrop;
      this._confirmButton = confirmButton;
      this.appendChild(backdrop);
    } else {
      content.append(map, addressLabel, controls, status);
      this.appendChild(content);
    }

    this._map = createBeaconMap(map, { interactive: true, zoom: config.defaultZoom });
    this._marker = L.marker([config.defaultCenter.lat, config.defaultCenter.lng], {
      draggable: true,
      icon: L.divIcon({
        className: 'cn-map-pin-picker__leaflet-icon',
        html: createElement('span', { cls: 'cn-map-pin-picker__marker' }),
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      }),
      title: 'Selected report location'
    }).addTo(this._map);
    this._marker.on('dragend', () => this._setCoordinates(this._marker.getLatLng(), true));
    this._map.on('click', ({ latlng }) => this._setCoordinates(latlng, true));
  }

  open(returnFocus = null) {
    if (!this._backdrop) return;
    this._returnFocus = returnFocus;
    this._backdrop.hidden = false;
    requestAnimationFrame(() => {
      this._map?.invalidateSize();
      this._backdrop?.querySelector('.cn-map-pin-picker__close')?.focus();
    });
    if (!this._hasOpened) this._locate();
    this._hasOpened = true;
  }

  close() {
    if (!this._backdrop) return;
    this._backdrop.hidden = true;
    this._returnFocus?.focus();
    this._returnFocus = null;
  }

  _setCoordinates(position, isManual = false) {
    const { lat, lng } = position;
    if (
      !Number.isFinite(lat)
      || !Number.isFinite(lng)
      || lat < -35
      || lat > -22
      || lng < 16
      || lng > 33
    ) {
      this._status.textContent = 'Choose a location in South Africa.';
      this._marker.setLatLng(this._coordinates || [config.defaultCenter.lat, config.defaultCenter.lng]);
      return false;
    }

    this._coordinates = { lat, lng };
    if (isManual) this._locationRevision += 1;
    this._marker.setLatLng(position);
    this._status.textContent = 'Pin selected. Drag it or tap elsewhere on the map to adjust.';
    return true;
  }

  _locate(button = null) {
    if (!navigator.geolocation) {
      this._status.textContent = 'Location services are not available in this browser. Drag the pin or tap the map instead.';
      return;
    }

    if (button) button.disabled = true;
    this._status.textContent = 'Finding your approximate location…';
    const locationRevision = this._locationRevision;
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          if (locationRevision !== this._locationRevision) {
            if (button) button.disabled = false;
            return;
          }
          const position = { lat: coords.latitude, lng: coords.longitude };
          if (!this._setCoordinates(position)) {
            if (button) button.disabled = false;
            return;
          }
          this._map.setView([position.lat, position.lng], 16);
          this._status.textContent = 'Approximate location found. Drag the pin to fine-tune it.';
          if (button) button.disabled = false;
        },
        (error) => {
          if (locationRevision !== this._locationRevision) {
            if (button) button.disabled = false;
            return;
          }
          const messages = {
            1: 'Location access was denied. Allow it in your browser, or drag the pin to choose manually.',
            2: 'Your location could not be determined. Check your device settings or choose manually.',
            3: 'Finding your location timed out. Please try again or choose manually.'
          };
          this._status.textContent = messages[error.code] || 'Location could not be determined. Please choose manually.';
          if (button) button.disabled = false;
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
      );
    } catch {
      if (button) button.disabled = false;
      this._status.textContent = 'The browser could not start location services. Please choose manually.';
    }
  }

  disconnectedCallback() {
    this._map?.remove();
    this._map = null;
    super.disconnectedCallback();
  }
}
customElements.define('cn-map-pin-picker', CnMapPinPicker);
