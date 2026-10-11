/**
 * @file apps/resident-pwa/src/router.js
 * Hash-based router. Safe DOM parsing only. Lazy page mounting.
 */
import { sessionStore } from './session.js';
import { clearChildren, createElement, setText } from '@civicneuro/security-web';

const routes = {
  'welcome': { auth: false, guest: true },
  'sign-in': { auth: false, guest: true },
  'register': { auth: false, guest: true },
  'verify-email': { auth: false, guest: true },
  'forgot-password': { auth: false, guest: true },
  'reset-password': { auth: false, guest: true },
  'session-expired': { auth: false, guest: true },
  'guest-report': { auth: false, guest: true },
  'guest-confirmation': { auth: false, guest: true },
  'report-submitted': { auth: true, guest: true },
  'track-report': { auth: true, guest: true },
  'home': { auth: true, guest: true },
  'my-reports': { auth: true, guest: false },
  'report-new': { auth: true, guest: true },
  'report-detail': { auth: true, guest: true },
  'report-thread': { auth: true, guest: true },
  'report-duplicate-check': { auth: true, guest: true },
  'report-satisfaction': { auth: true, guest: true },
  'report-reopen-escalate': { auth: true, guest: true },
  'empty-state': { auth: true, guest: true },
  'error-state': { auth: true, guest: true },
  'offline-queued': { auth: true, guest: true },
  'alerts': { auth: true, guest: true },
  'notifications': { auth: true, guest: true },
  'lifeline-home': { auth: true, guest: true },
  'lifeline-call-countdown': { auth: true, guest: true },
  'lifeline-calling-status': { auth: true, guest: true },
  'lifeline-card-create': { auth: true, guest: false },
  'lifeline-card-edit': { auth: true, guest: false },
  'lifeline-contacts-picker': { auth: true, guest: false },
  'contacts-permission': { auth: true, guest: true },
  'beacon-home': { auth: true, guest: false },
  'beacon-safety-notice': { auth: true, guest: false },
  'beacon-add-to-circle': { auth: true, guest: false },
  'beacon-requests': { auth: true, guest: false },
  'beacon-find-contacts': { auth: true, guest: false },
  'beacon-chat': { auth: true, guest: false },
  'beacon-share-session': { auth: true, guest: false },
  'beacon-draw-path': { auth: true, guest: false },
  'beacon-start-confirm': { auth: true, guest: false },
  'snap-and-say': { auth: true, guest: true },
  'your-area': { auth: true, guest: true },
  'polls': { auth: true, guest: true },
  'poll-detail': { auth: true, guest: true },
  'community-pulse': { auth: true, guest: true },
  'trending-issues': { auth: true, guest: true },
  'news': { auth: true, guest: true },
  'news-article': { auth: true, guest: true },
  'survey': { auth: true, guest: true },
  'survey-submitted': { auth: true, guest: true },
  'safety-info': { auth: true, guest: true },
  'help-and-safety': { auth: true, guest: true },
  'menu': { auth: true, guest: true },
  'account': { auth: true, guest: false },
  'profile-edit': { auth: true, guest: false },
  'badges-edit': { auth: true, guest: false },
  'notification-settings': { auth: true, guest: false },
  'privacy-policy': { auth: true, guest: true },
  'terms': { auth: true, guest: true },
  'contacts': { auth: true, guest: true },
  'language': { auth: true, guest: true },
  'data-export': { auth: true, guest: false },
  'delete-account': { auth: true, guest: false },
  'pilot-org-select': { auth: true, guest: true }
};

let currentRoute = null;
let currentParams = {};

export function parseHash() {
  const hash = window.location.hash.slice(1) || 'welcome';
  const [path, queryStr] = hash.split('?');
  const params = {};
  if (queryStr) {
    const search = new URLSearchParams(queryStr);
    for (const [k, v] of search.entries()) {
      params[k] = v;
    }
  }
  return { path, params };
}

export function navigate(route, params = {}) {
  const query = new URLSearchParams(params).toString();
  window.location.hash = query ? `${route}?${query}` : route;
}

export async function handleRouteChange() {
  const { path: routeName, params } = parseHash();
  const session = sessionStore.get();

  const routeDef = routes[routeName] || routes['welcome'];
  const targetRoute = routeName === 'alerts'
    ? 'notifications'
    : (routes[routeName] ? routeName : 'welcome');

  // Auth guards
  if (routeDef.auth && !session.isAuthenticated) {
    navigate('welcome');
    return;
  }
  if (!routeDef.guest && session.isGuest) {
    navigate('sign-in');
    return;
  }

  currentRoute = targetRoute;
  currentParams = params;

  const appShell = document.querySelector('cn-app-shell');
  if (appShell) {
    await appShell.loadRoute(targetRoute, params);
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange();
}
