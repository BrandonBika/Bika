/**
 * @file packages/supabase-client/src/auth.js
 * In-memory token management only. Never writes tokens to localStorage/sessionStorage/cookies.
 */
let inMemoryAccessToken = null;
let inMemoryRefreshToken = null;
let inMemoryUser = null;
const authChangeListeners = [];

export function setSession(token, user, refreshToken = null) {
  inMemoryAccessToken = token;
  inMemoryRefreshToken = refreshToken;
  inMemoryUser = user;
  for (const fn of authChangeListeners) fn({ token, user });
}

export function clearSession() {
  inMemoryAccessToken = null;
  inMemoryRefreshToken = null;
  inMemoryUser = null;
  for (const fn of authChangeListeners) fn({ token: null, user: null });
}

export function getAccessToken() {
  return inMemoryAccessToken;
}

export function getRefreshToken() {
  return inMemoryRefreshToken;
}

export function getCurrentUser() {
  return inMemoryUser;
}

export function onAuthStateChange(callback) {
  authChangeListeners.push(callback);
  return () => {
    const idx = authChangeListeners.indexOf(callback);
    if (idx >= 0) authChangeListeners.splice(idx, 1);
  };
}

export async function signInWithPassword(credentials) {
  const result = await requestSupabase('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: credentials,
    auth: false
  });
  setSession(result.access_token, result.user, result.refresh_token);
  return result;
}

export async function signUp({ email, password, metadata, emailRedirectTo }) {
  const path = new URL('/auth/v1/signup', 'https://supabase.invalid');
  if (emailRedirectTo) path.searchParams.set('redirect_to', emailRedirectTo);
  return requestSupabase(emailRedirectTo ? `${path.pathname}${path.search}` : '/auth/v1/signup', {
    method: 'POST',
    body: { email, password, data: metadata },
    auth: false
  });
}

export async function resendSignupVerification(email) {
  return requestSupabase('/auth/v1/resend', {
    method: 'POST',
    body: { type: 'signup', email },
    auth: false
  });
}

export async function requestPasswordReset(email, redirectTo) {
  const path = new URL('/auth/v1/recover', 'https://supabase.invalid');
  if (redirectTo) path.searchParams.set('redirect_to', redirectTo);
  return requestSupabase(redirectTo ? `${path.pathname}${path.search}` : '/auth/v1/recover', {
    method: 'POST',
    body: { email },
    auth: false
  });
}

export async function updatePassword(password) {
  return requestSupabase('/auth/v1/user', {
    method: 'PUT',
    body: { password }
  });
}

export async function getUser(accessToken) {
  return requestSupabase('/auth/v1/user', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  });
}

export async function refreshSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearSession();
    throw new Error('Your session has expired. Please sign in again.');
  }

  try {
    const result = await requestSupabase('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: refreshToken },
      auth: false
    });
    setSession(result.access_token, result.user, result.refresh_token);
    return result.access_token;
  } catch (error) {
    clearSession();
    throw error;
  }
}

export async function signOut() {
  try {
    if (getAccessToken()) {
      await requestSupabase('/auth/v1/logout', { method: 'POST' });
    }
  } finally {
    clearSession();
  }
}

import { requestSupabase } from './client.js';
