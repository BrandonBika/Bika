import * as L from '../../../public/vendor/leaflet/leaflet-src.esm.js';
import { config } from '../../config.js';

export function createBeaconMap(container, { interactive = true, zoom = 15 } = {}) {
  const map = L.map(container, {
    zoomControl: false,
    scrollWheelZoom: false,
    dragging: interactive,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    keyboard: interactive
  }).setView([config.defaultCenter.lat, config.defaultCenter.lng], zoom);

  L.tileLayer(config.tileHost, {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  requestAnimationFrame(() => {
    if (container.isConnected) map.invalidateSize();
  });

  return map;
}

export function mockPercentToLatLng(position) {
  return [
    config.defaultCenter.lat + (50 - Number(position.lat)) * 0.0008,
    config.defaultCenter.lng + (Number(position.lng) - 50) * 0.001
  ];
}

export function mockPathToLatLngs(points) {
  return points.map((point) => {
    if (Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])) {
      return [point[0], point[1]];
    }
    if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
      return [point.lat, point.lng];
    }
    return [
      config.defaultCenter.lat + (350 - point.y) * 0.00005,
      config.defaultCenter.lng + (point.x - 215) * 0.000055
    ];
  });
}

export function rebasePathToLocation(points, location) {
  const latLngs = mockPathToLatLngs(points);
  if (!location || latLngs.length === 0) return latLngs;
  const latitudeOffset = location.lat - latLngs[0][0];
  const longitudeOffset = location.lng - latLngs[0][1];
  return latLngs.map(([lat, lng]) => [lat + latitudeOffset, lng + longitudeOffset]);
}

export function createBeaconDivIcon(initial, variant = 'member') {
  const content = document.createElement('span');
  content.textContent = String(initial || '?').slice(0, 1);
  content.className = 'beacon-leaflet-marker__initial';

  const wrapper = document.createElement('span');
  wrapper.className = `beacon-leaflet-marker beacon-leaflet-marker--${variant}`;
  wrapper.appendChild(content);

  return L.divIcon({
    className: 'beacon-leaflet-icon',
    html: wrapper,
    iconSize: variant === 'self' ? [34, 34] : [32, 38],
    iconAnchor: variant === 'self' ? [17, 17] : [16, 19]
  });
}

export function createBeaconDotIcon(offPath = false) {
  const dot = document.createElement('span');
  dot.className = `beacon-leaflet-dot${offPath ? ' beacon-leaflet-dot--offpath' : ''}`;
  return L.divIcon({
    className: 'beacon-leaflet-icon',
    html: dot,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

export { L };
