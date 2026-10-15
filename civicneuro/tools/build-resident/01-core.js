/**
 * @file tools/build-resident/01-core.js
 * Generates Core App Shell files: config, session, router, main, index.html, manifest, service-worker, styles.
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

// 1. config.js
write('apps/resident-pwa/src/config.js', `/**
 * @file apps/resident-pwa/src/config.js
 * Central runtime configuration for Resident PWA.
 */
export const config = {
  env: 'development',
  useMock: true, // Switch to false for live backend
  supabaseUrl: 'https://mock-project.supabase.co',
  supabaseAnonKey: 'mock-anon-key-resident',
  tileHost: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  defaultCenter: { lat: -29.8587, lng: 31.0218 }, // Durban, ZA
  defaultZoom: 13,
  supportPhone: '0800000000',
  mediaLimits: {
    maxPhotos: 4,
    maxPhotoSizeMB: 10,
    maxVoiceSeconds: 60
  }
};
`);

// 2. session.js
write('apps/resident-pwa/src/session.js', `/**
 * @file apps/resident-pwa/src/session.js
 * In-memory session manager. Zero PII or tokens stored in localStorage.
 */
import { createStore } from '@civicneuro/state';
import { setSession, clearSession as clearSupabaseSession } from '@civicneuro/supabase-client';

export const sessionStore = createStore({
  isAuthenticated: false,
  isGuest: false,
  user: null,
  activeSharesCount: 0,
  unreadAlertsCount: 2,
  language: 'en'
});

export function startResidentSession(token, user) {
  setSession(token, user);
  sessionStore.update((s) => ({
    ...s,
    isAuthenticated: true,
    isGuest: false,
    user
  }));
}

export function startGuestSession() {
  clearSupabaseSession();
  sessionStore.update((s) => ({
    ...s,
    isAuthenticated: true,
    isGuest: true,
    user: { fullName: 'Guest Resident', role: 'guest' }
  }));
}

export function endSession() {
  clearSupabaseSession();
  sessionStore.update((s) => ({
    ...s,
    isAuthenticated: false,
    isGuest: false,
    user: null
  }));
}
`);

// 3. router.js
write('apps/resident-pwa/src/router.js', `/**
 * @file apps/resident-pwa/src/router.js
 * Hash-based router. Zero innerHTML. Lazy page mounting.
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
  'alerts': { auth: true, guest: true },
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
  window.location.hash = query ? \`\${route}?\${query}\` : route;
}

export async function handleRouteChange() {
  const { path: routeName, params } = parseHash();
  const session = sessionStore.get();

  const routeDef = routes[routeName] || routes['welcome'];
  const targetRoute = routes[routeName] ? routeName : 'welcome';

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
`);

// 4. index.html
write('apps/resident-pwa/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="CivicNeuro — Fast, secure civic issue reporting and community safety for South African residents.">
  <meta name="theme-color" content="#0052cc">
  <link rel="manifest" href="./manifest.webmanifest">
  <title>CivicNeuro — Resident Portal</title>
  <link rel="stylesheet" href="./src/styles/main.css">
</head>
<body>
  <cn-app-shell id="app"></cn-app-shell>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
`);

// 5. styles/main.css
write('apps/resident-pwa/src/styles/main.css', `/* Core Design System and Base Styles */
@import '../../../../packages/design-tokens/src/tokens.css';
@import '../../../../packages/design-tokens/src/themes-light-dark.css';
@import '../../../../packages/design-tokens/src/typography.css';
@import '../../../../packages/design-tokens/src/reset.css';
@import '../../../../packages/ui/src/button/button.css';
@import '../../../../packages/ui/src/input/input.css';
@import '../../../../packages/ui/src/modal/modal.css';
@import '../../../../packages/ui/src/table/table.css';
@import '../../../../packages/ui/src/toast/toast.css';

:root {
  --cn-app-max-width: 480px;
}

body {
  background-color: var(--cn-color-bg, #f4f5f7);
  color: var(--cn-color-text, #172b4d);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: center;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

#app {
  width: 100%;
  max-width: var(--cn-app-max-width);
  min-height: 100vh;
  background-color: var(--cn-color-surface, #ffffff);
  position: relative;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.05);
}
`);

// 6. manifest.webmanifest
write('apps/resident-pwa/manifest.webmanifest', JSON.stringify({
  name: 'CivicNeuro Resident',
  short_name: 'CivicNeuro',
  start_url: './index.html',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#0052cc',
  icons: [
    {
      src: './public/icons/icon-192.png',
      sizes: '192x192',
      type: 'image/png'
    },
    {
      src: './public/icons/icon-512.png',
      sizes: '512x512',
      type: 'image/png'
    }
  ]
}, null, 2));

// 7. offline.html
write('apps/resident-pwa/offline.html', `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline — CivicNeuro</title>
  <style>
    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; }
    h1 { color: #0052cc; }
    p { color: #5e6c84; }
  </style>
</head>
<body>
  <h1>You are offline</h1>
  <p>CivicNeuro is keeping your queued reports safe on device. Reconnect to sync.</p>
</body>
</html>
`);

// 8. service-worker.js
write('apps/resident-pwa/service-worker.js', `/**
 * @file apps/resident-pwa/service-worker.js
 * Service worker strictly caching shell files only.
 * NEVER caches API responses, signed URLs, or personal data.
 */
const CACHE_NAME = 'cn-shell-v1';
const SHELL_ASSETS = [
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './src/main.js',
  './src/styles/main.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Only cache GET requests for static app shell
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.pathname.includes('/functions/') || url.pathname.includes('/rest/')) {
    return; // NEVER cache dynamic API calls
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => caches.match('./offline.html')))
  );
});
`);

// 9. package.json for resident-pwa
write('apps/resident-pwa/package.json', JSON.stringify({
  name: '@civicneuro/resident-pwa',
  version: '0.1.0',
  private: true,
  type: 'module',
  scripts: {
    'dev': 'node ../../tools/dev-server.js'
  }
}, null, 2));

console.log('Core files generated successfully.');
