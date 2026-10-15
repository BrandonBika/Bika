/**
 * @file apps/resident-pwa/src/main.js
 * App bootstrapping: loads components, initializes i18n & router, registers service worker.
 */
import { initI18n, setLocale } from '@civicneuro/i18n';
import { initRouter } from './router.js';
import { configureFunctionsClient } from '@civicneuro/functions-client';
import { configureSupabaseClient, getAccessToken } from '@civicneuro/supabase-client';
import { showToast } from '@civicneuro/ui';
import { config } from './config.js';
import { triggerQueueSync } from './features/offline/offline.client.js';
import './components/app-shell/app-shell.js';

async function syncQueuedReports() {
  const results = await triggerQueueSync();
  for (const result of results) {
    if (result.item.payload?.type !== 'snap-and-say') continue;
    if (result.success) {
      showToast('Your queued Snap & Say report was submitted.', { type: 'success' });
    } else if (result.permanentFailure) {
      showToast('A queued Snap & Say report was rejected and was not submitted.', { type: 'error' });
    } else if (!result.skipped) {
      showToast('A saved Snap & Say report could not be retried yet. It remains queued.', { type: 'warning' });
    }
  }
}

async function bootstrap() {
  const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  if (!config.useMock && hasSupabaseConfig) {
    configureSupabaseClient({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey });
  }

  configureFunctionsClient({
    useMock: config.useMock,
    getAuthToken: getAccessToken,
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey
  });

  // Initialize i18n
  try {
    const enRes = await fetch('../../../packages/i18n/src/locales/en.json').then(r => r.json()).catch(() => ({}));
    if (Object.keys(enRes).length > 0) {
      initI18n({ en: enRes });
    }
  } catch (error) {
    console.error('Could not initialize translations.', error);
  }

  if (!config.useMock && hasSupabaseConfig) {
    const { handleAuthRedirect } = await import('./features/auth/auth.client.js');
    const authRedirect = await handleAuthRedirect();
    if (authRedirect === 'recovery') window.location.hash = 'reset-password';
    if (authRedirect === 'verified') window.location.hash = 'home';
  }

  initRouter();
  window.addEventListener('online', () => {
    syncQueuedReports().catch((error) => {
      console.error('Queued report sync could not start.', error);
      showToast('A saved report could not be retried yet. It remains queued.', { type: 'warning' });
    });
  });
  if (navigator.onLine) {
    syncQueuedReports().catch((error) => {
      console.error('Queued report sync could not start.', error);
    });
  }
  if (!config.useMock && !hasSupabaseConfig) {
    showToast('Preview is available, but Supabase auth needs a project URL and public anon key in apps/resident-pwa/runtime-config.js.', {
      type: 'warning',
      duration: 12000
    });
  }

  // Register Service Worker (production / PWA)
  if ('serviceWorker' in navigator && config.env === 'production') {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.error('Could not register the service worker.', error);
    });
  }
}

bootstrap().catch((error) => {
  console.error('Resident PWA startup failed.', error);
  const app = document.querySelector('cn-app-shell');
  if (app) {
    app.textContent = `The app could not start: ${error.message}`;
  }
});
