/**
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

export function startResidentSession(token, user, refreshToken = null) {
  setSession(token, user, refreshToken);
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
