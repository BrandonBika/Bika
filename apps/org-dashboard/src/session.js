import { INACTIVITY_TIMEOUT_MS, ORG_ROLES } from './config.js';
import { signOut } from './features/auth/auth.client.js';
import { supabase } from './features/supabase.client.js';

export async function loadOrganizationContext() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('user_id,organization_id,role,is_active')
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError) {
    await signOut();
    throw new Error('Could not verify organisation access. Please sign in again.');
  }
  if (!membership || !membership.is_active
    || ![ORG_ROLES.ADMIN, ORG_ROLES.EMPLOYEE].includes(membership.role)) {
    await signOut();
    return {
      blocked: true,
      status: 'no-membership',
      message: 'This account is not an active member of a Bika organisation.'
    };
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id,name,status,is_active')
    .eq('id', membership.organization_id)
    .maybeSingle();
  if (organizationError) {
    await signOut();
    throw new Error('Could not verify your organisation status. Please sign in again.');
  }
  if (!organization) {
    await signOut();
    return {
      blocked: true,
      status: 'unavailable',
      message: 'Your organisation record is unavailable. Contact Bika support.'
    };
  }
  if (organization.status !== 'approved' || !organization.is_active) {
    await signOut();
    return {
      blocked: true,
      status: organization.status,
      message: organization.status === 'pending'
        ? 'Application pending. Dashboard access starts after Platform Admin approval.'
        : organization.status === 'rejected'
          ? 'This organisation application was rejected. Contact Bika support.'
          : 'This organisation is inactive. Contact Bika support.'
    };
  }

  return Object.freeze({
    userId: user.id,
    email: user.email || '',
    fullName: user.user_metadata?.full_name || '',
    role: membership.role,
    organization
  });
}

export function startSessionGuard(onExpired) {
  let lastActivity = Date.now();
  const updateActivity = () => { lastActivity = Date.now(); };
  const events = ['pointerdown', 'keydown', 'touchstart'];
  for (const eventName of events) window.addEventListener(eventName, updateActivity, { passive: true });

  const timer = window.setInterval(async () => {
    if (Date.now() - lastActivity < INACTIVITY_TIMEOUT_MS) return;
    window.clearInterval(timer);
    for (const eventName of events) window.removeEventListener(eventName, updateActivity);
    try {
      await signOut();
      onExpired();
    } catch (error) {
      onExpired(error);
    }
  }, 30_000);
  return () => {
    window.clearInterval(timer);
    for (const eventName of events) window.removeEventListener(eventName, updateActivity);
  };
}