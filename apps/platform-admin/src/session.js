import { signOut } from './features/auth/auth.client.js';
import { supabase } from './features/supabase.client.js';
import { withTimeout } from './features/with-timeout.js';

let staffContext = null;

export function getStaffContext() {
  return staffContext;
}

export function clearStaffContext() {
  staffContext = null;
}

export async function loadStaffContext() {
  const { data: sessionData, error: sessionError } = await withTimeout(
    supabase.auth.getSession(),
    'Session lookup'
  );
  if (sessionError) throw sessionError;

  const user = sessionData.session?.user;
  if (!user) {
    clearStaffContext();
    return null;
  }

  const { data: staff, error } = await withTimeout(
    supabase
      .from('platform_staff')
      .select('user_id, role, full_name, is_active')
      .eq('user_id', user.id)
      .maybeSingle(),
    'Staff account lookup'
  );

  if (error) {
    clearStaffContext();
    console.error('Could not verify platform staff access.', error);
    try {
      await signOut();
    } catch (signOutError) {
      console.error('Could not clear the unverified auth session.', signOutError);
      throw new Error('Could not verify platform staff access. Please try again or contact a Platform Admin.');
    }
    throw new Error('Could not verify platform staff access. Please try again or contact a Platform Admin.');
  }

  if (!staff || !staff.is_active) {
    clearStaffContext();
    await signOut();
    throw new Error(
      'This account is not an active CivicNeuro platform staff account. Contact a Platform Admin.'
    );
  }

  if (!['platform_admin', 'platform_employee'].includes(staff.role)) {
    clearStaffContext();
    await signOut();
    throw new Error('This account does not have an allowed platform staff role.');
  }

  staffContext = Object.freeze({
    userId: user.id,
    email: user.email ?? '',
    role: staff.role,
    fullName: staff.full_name ?? ''
  });
  return staffContext;
}