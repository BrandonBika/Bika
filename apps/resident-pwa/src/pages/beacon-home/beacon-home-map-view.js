import { config } from '../../config.js';

export function getBeaconHomeFallbackMapView() {
  return {
    center: [config.defaultCenter.lat, config.defaultCenter.lng],
    zoom: config.defaultZoom
  };
}
