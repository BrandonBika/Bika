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

export function startGuestSession(token, user, refreshToken = null) {
  if (!token || !user?.id) {
    throw new Error('A valid anonymous Supabase session is required.');
  }
  setSession(token, user, refreshToken);
  sessionStore.update((s) => ({
    ...s,
    isAuthenticated: true,
    isGuest: true,
    user: { id: user.id, fullName: 'Guest Resident', role: 'guest', isAnonymous: true }
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
