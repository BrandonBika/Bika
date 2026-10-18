const STORAGE_KEY = 'civicneuro:resident-pwa:route-history';

export function createRouteHistory(browserWindow, maxEntries = 50) {
  let routes = [];
  let initialized = false;

  function currentHash() {
    return browserWindow.location.hash.slice(1) || 'welcome';
  }

  function persist() {
    try {
      browserWindow.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
    } catch (error) {
      console.warn('Could not persist resident route history.', error);
    }
  }

  function initialize(hash = currentHash()) {
    if (initialized) return;

    try {
      const saved = browserWindow.sessionStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed) && parsed.every((route) => typeof route === 'string')) {
        routes = parsed.slice(-maxEntries);
      }
    } catch (error) {
      console.warn('Could not restore resident route history.', error);
    }

    if (!routes.length || routes[routes.length - 1] !== hash) routes = [hash];
    initialized = true;
    persist();
  }

  function appendRoute(hash) {
    if (routes[routes.length - 1] === hash) return;
    routes.push(hash);
    if (routes.length > maxEntries) routes = routes.slice(-maxEntries);
    persist();
  }

  function trackForwardRoute(hash) {
    initialize();
    appendRoute(hash);
  }

  function recordRouteChange(hash = currentHash()) {
    initialize(hash);
    if (routes[routes.length - 1] === hash) return;

    if (routes.length > 1 && routes[routes.length - 2] === hash) {
      routes.pop();
      persist();
      return;
    }

    appendRoute(hash);
  }

  function replaceCurrentRoute(hash) {
    initialize();
    if (!routes.length) {
      routes = [hash];
    } else {
      routes[routes.length - 1] = hash;
    }
    persist();
  }

  function canGoBack() {
    initialize();
    return routes.length > 1;
  }

  function navigate(route, params = {}, options = {}) {
    const query = new URLSearchParams(params).toString();
    const hash = query ? `${route}?${query}` : route;
    initialize();

    if (options?.replace) {
      replaceCurrentRoute(hash);
      browserWindow.location.replace(
        `${browserWindow.location.pathname}${browserWindow.location.search}#${hash}`
      );
      return;
    }

    trackForwardRoute(hash);
    browserWindow.location.hash = hash;
  }

  function goBack(fallbackRoute, fallbackParams = {}) {
    if (canGoBack()) {
      browserWindow.history.back();
      return;
    }
    navigate(fallbackRoute, fallbackParams, { replace: true });
  }

  function getRoutes() {
    initialize();
    return [...routes];
  }

  return {
    canGoBack,
    getRoutes,
    goBack,
    initialize,
    navigate,
    recordRouteChange,
    trackForwardRoute
  };
}
