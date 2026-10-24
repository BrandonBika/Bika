import { APP_BASE_PATH } from '../../config.js';
import { supabase } from '../supabase.client.js';
import { withTimeout } from '../with-timeout.js';

export async function signInWithPassword(email, password) {
  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    'Sign-in request'
  );
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await withTimeout(supabase.auth.signOut({ scope: 'local' }), 'Sign-out request');
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const redirectTo = new URL(APP_BASE_PATH, window.location.origin);
  redirectTo.searchParams.set('page', 'reset-password');
  const { error } = await withTimeout(
    supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo.toString() }),
    'Password reset request'
  );
  if (error) throw error;
}

export async function updatePassword(password) {
  const { data, error } = await withTimeout(
    supabase.auth.updateUser({ password }),
    'Password update request'
  );
  if (error) throw error;
  return data;
}

export function subscribeToAuthChanges(callback) {
  return supabase.auth.onAuthStateChange(callback);
}