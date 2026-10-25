function routeFromLocation() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash) {
    const [route, ...rest] = hash.split('/');
    return { route: decodeURIComponent(route), param: rest.map(decodeURIComponent).join('/') };
  }
  const page = new URLSearchParams(window.location.search).get('page');
  return { route: page || 'login', param: '' };
}

export function getCurrentRoute() {
  return routeFromLocation().route;
}

export function getCurrentRouteParam() {
  return routeFromLocation().param;
}

export function navigate(route, param = '') {
  const suffix = param ? `/${encodeURIComponent(param)}` : '';
  window.location.hash = `/${route}${suffix}`;
}

export function subscribeToRouteChanges(callback) {
  window.addEventListener('hashchange', callback);
}