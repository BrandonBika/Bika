export function isBeaconRouteGated(routeName, params = {}, beaconEnabled = false) {
  const isBeaconRoute = routeName.startsWith('beacon-')
    || (routeName === 'contacts-permission' && params.source === 'beacon');
  if (routeName === 'beacon-draw-path' && !params.shareId) return true;
  return isBeaconRoute && beaconEnabled !== true;
}
