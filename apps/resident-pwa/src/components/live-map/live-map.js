/**
 * @file apps/resident-pwa/src/components/live-map/live-map.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import {
  createBeaconDivIcon,
  createBeaconMap,
  mockPercentToLatLng,
  L
} from '../../features/beacon/leaflet-map.js';

export class CnLiveMap extends BaseElement {
  set data(members) {
    this._members = Array.isArray(members) ? members : [];
    if (this.isConnected) this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this._map?.remove();
    this._map = null;
    clearChildren(this);
    this.classList.add('cn-live-map');
    this._map = createBeaconMap(this, { zoom: 15 });

    const sharingMembers = (this._members || []).filter((member) => member.isSharing);
    const selfMarker = L.marker([-29.8587, 31.0218], {
      icon: createBeaconDivIcon('Y', 'self'),
      title: 'Your location'
    }).addTo(this._map);
    selfMarker.getElement()?.setAttribute('aria-label', 'Your location');

    sharingMembers.forEach((member) => {
      const marker = L.marker(mockPercentToLatLng(member), {
        icon: createBeaconDivIcon(member.initial),
        title: `${member.name} is sharing live location`
      }).addTo(this._map);
      marker.getElement()?.setAttribute(
        'aria-label',
        `${member.name} is sharing live location`
      );
    });
  }

  disconnectedCallback() {
    this._map?.remove();
    this._map = null;
    super.disconnectedCallback();
  }
}
customElements.define('cn-live-map', CnLiveMap);
