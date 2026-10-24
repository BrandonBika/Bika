import { INACTIVITY_TIMEOUT_MS } from '../../config.js';
import { signOut, subscribeToAuthChanges } from './auth.client.js';
import { clearStaffContext } from '../../session.js';

const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
const LAST_ACTIVITY_KEY = 'civicneuro-platform-last-activity';

function recordActivity() {
  sessionStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

function getLastActivity() {
  const stored = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : Date.now();
}

export function startSessionGuard({ onSignedOut, onTimeout }) {
  let signedIn = false;
  let currentUserId = null;
  recordActivity();
  for (const eventName of activityEvents) {
    window.addEventListener(eventName, recordActivity, { passive: true });
  }

  const timer = window.setInterval(async () => {
    if (!signedIn) return;
    if (Date.now() - getLastActivity() < INACTIVITY_TIMEOUT_MS) return;
    window.clearInterval(timer);
    for (const eventName of activityEvents) {
      window.removeEventListener(eventName, recordActivity);
    }

    clearStaffContext();
    try {
      await signOut();
      onTimeout();
    } catch (error) {
      onTimeout(error);
    }
  }, 30_000);

  const { data: { subscription } } = subscribeToAuthChanges((event, session) => {
    const nextUserId = session?.user?.id ?? null;
    if (event !== 'SIGNED_OUT' && nextUserId === currentUserId) return;
    if (event === 'SIGNED_OUT') {
      if (currentUserId === null) return;
      currentUserId = null;
      signedIn = false;
      clearStaffContext();
      onSignedOut();
    } else if (event === 'SIGNED_IN') {
      currentUserId = nextUserId;
      signedIn = true;
      recordActivity();
    } else if (event === 'INITIAL_SESSION') {
      currentUserId = nextUserId;
      signedIn = Boolean(session);
    }
  });

  return () => {
    window.clearInterval(timer);
    for (const eventName of activityEvents) {
      window.removeEventListener(eventName, recordActivity);
    }
    subscription.unsubscribe();
  };
}