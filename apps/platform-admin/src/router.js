const routeNames = new Set([
  'home',
  'dashboard',
  'report-sheet',
  'report-detail',
  'posts',
  'chat',
  'surveys',
  'analytics',
  'manage-profiles',
  'export-data',
  'my-profile',
  'organisation-approvals',
  'pilot-mode',
  'platform-activity',
  'system-settings',
  'platform-team',
  'login',
  'forgot-password',
  'reset-password'
]);

export function getCurrentRoute() {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has('code') || searchParams.get('page') === 'reset-password') {
    return 'reset-password';
  }

  const hash = window.location.hash;
  if (hash.startsWith('#/')) {
    const route = hash.slice(2).split('?')[0].split('/')[0];
    return routeNames.has(route) ? route : 'not-found';
  }

  return 'dashboard';
}

export function getCurrentRouteParam() {
  const hash = window.location.hash;
  if (!hash.startsWith('#/')) return '';
  const value = hash.slice(2).split('?')[0].split('/')[1] ?? '';
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

export function navigate(route) {
  window.location.hash = `/${route}`;
}

export function subscribeToRouteChanges(callback) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}