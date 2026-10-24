const LIVE_LOCATION_ROUTES = new Set([
  'beacon-start-confirm',
  'beacon-share-session',
  'beacon-draw-path'
]);

export function isBeaconRouteGated(routeName, params = {}, beaconEnabled = false) {
  const isBeaconRoute = routeName.startsWith('beacon-')
    || (routeName === 'contacts-permission' && params.source === 'beacon');
  if (LIVE_LOCATION_ROUTES.has(routeName)) return true;
  return isBeaconRoute && beaconEnabled !== true;
}
