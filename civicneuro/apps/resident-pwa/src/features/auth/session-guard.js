/**
 * @file apps/resident-pwa/src/features/auth/session-guard.js
 */
import { sessionStore } from '../../session.js';

export function requireAuth() {
  const session = sessionStore.get();
  return session.isAuthenticated;
}

export function requireResident() {
  const session = sessionStore.get();
  return session.isAuthenticated && !session.isGuest;
}
