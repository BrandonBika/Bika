/**
 * @file apps/resident-pwa/src/features/auth/auth.client.js
 */
import {
  clearSession,
  getUser,
  requestPasswordReset,
  resendSignupVerification,
  selectRows,
  setSession,
  signInAnonymously as supabaseSignInAnonymously,
  signInWithPassword,
  signOut as supabaseSignOut,
  signUp,
  updatePassword
} from '@civicneuro/supabase-client';
import { startGuestSession, startResidentSession, endSession } from '../../session.js';

function normalizePhoneNumber(identifier) {
  const compact = identifier.replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(compact)) return `+27${compact.slice(1)}`;
  if (/^\d{11}$/.test(compact)) return `+${compact}`;
  return compact;
}

function mapResidentUser(user, profile) {
  return {
    id: user.id,
    fullName: profile.full_name,
    phone: profile.phone,
    email: profile.email,
    address: profile.address
  };
}

async function getResidentProfile(user) {
  try {
    const profiles = await selectRows('resident_profiles', { id: user.id });
    if (profiles.length) return profiles[0];
  } catch (error) {
    if (error.code !== 'PGRST205' && error.code !== '42P01') throw error;
    console.warn('resident_profiles is not available yet; using Supabase Auth profile metadata until the migration is applied.');
  }

  const metadata = user.user_metadata || {};
  return {
    full_name: metadata.full_name || user.email?.split('@')[0] || 'Resident',
    email: user.email || '',
    phone: metadata.phone || '',
    address: metadata.address || ''
  };
}

export async function signIn(identifier, password) {
  const credential = identifier.includes('@')
    ? { email: identifier.trim().toLowerCase(), password }
    : { phone: normalizePhoneNumber(identifier), password };
  const result = await signInWithPassword(credential);
  try {
    const profile = await getResidentProfile(result.user);
    startResidentSession(result.access_token, mapResidentUser(result.user, profile), result.refresh_token);
    return { user: profile };
  } catch (error) {
    clearSession();
    throw error;
  }
}

export async function continueAsGuest() {
  const result = await supabaseSignInAnonymously();
  startGuestSession(result.access_token, result.user, result.refresh_token);
  return result.user;
}

export async function register(data) {
  return signUp({
    email: data.email.trim().toLowerCase(),
    password: data.password,
    emailRedirectTo: new URL('./', window.location.href).href,
    metadata: {
      full_name: data.fullName.trim(),
      phone: normalizePhoneNumber(data.phone),
      address: data.address.trim(),
      notification_consent: Boolean(data.notificationConsent),
      privacy_consent_at: data.consentTimestamp
    }
  });
}

export async function resendVerification(email) {
  return resendSignupVerification(email.trim().toLowerCase());
}

export async function forgotPassword(identifier) {
  const email = identifier.trim().toLowerCase();
  if (!email.includes('@')) {
    throw new Error('Enter the email address on your account to receive a password reset link.');
  }
  return requestPasswordReset(email, new URL('./', window.location.href).href);
}

export async function resetPassword(_token, newPassword) {
  await updatePassword(newPassword);
  endSession();
}

export async function handleAuthRedirect() {
  const hash = window.location.hash.slice(1);
  if (!hash.includes('access_token=') && !hash.includes('error_description=')) return null;

  const params = new URLSearchParams(hash);
  const errorDescription = params.get('error_description');
  if (errorDescription) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    throw new Error(errorDescription);
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');
  if (!accessToken || !refreshToken || !['signup', 'recovery'].includes(type)) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    throw new Error('The Supabase verification link is incomplete or unsupported. Request a new link and try again.');
  }

  setSession(accessToken, null, refreshToken);
  try {
    const user = await getUser();
    if (type === 'signup' && !user.email_confirmed_at) {
      throw new Error('Your email address has not been verified yet.');
    }
    if (type === 'signup') {
      const profile = await getResidentProfile(user);
      startResidentSession(accessToken, mapResidentUser(user, profile), refreshToken);
    }
    return type === 'recovery' ? 'recovery' : 'verified';
  } catch (error) {
    clearSession();
    throw error;
  } finally {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
}

export function signOut() {
  return supabaseSignOut().finally(endSession);
}
