const BLOCKED_BEACON_ROUTES = new Set(['beacon-draw-path']);

export function isBeaconRouteGated(routeName, params = {}, beaconEnabled = false) {
  const isBeaconRoute = routeName.startsWith('beacon-')
    || (routeName === 'contacts-permission' && params.source === 'beacon');
  if (BLOCKED_BEACON_ROUTES.has(routeName)) return true;
  return isBeaconRoute && beaconEnabled !== true;
}
