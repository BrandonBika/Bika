/**
 * @file apps/resident-pwa/src/features/lifeline/lifeline.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';
import { listLifelineCards, saveLifelineCard as saveLifelineCardRecord } from '@civicneuro/supabase-client';
import { sessionStore } from '../../session.js';
import { mergeLifelineCards } from './lifeline-groups.js';
import { sendLifelineInvitations } from './lifeline-calls.js';

let lastGroupCall = null;
const inFlightGroupCalls = new Map();

export const LIFELINE_STARTER_CARDS = [
  { id: 'starter-crime', name: 'Crime', icon: 'police', color: '#E6F1FB', isPreset: true, members: [{ id: 'starter-crime-saps', name: 'SAPS', phone: '10111', isPreset: true }] },
  { id: 'starter-fire', name: 'Fire', icon: 'fire', color: '#FBE4D3', isPreset: true, members: [{ id: 'starter-fire-department', name: 'Fire Department', phone: '0313610000', isPreset: true }] },
  { id: 'starter-sickness', name: 'Sickness', icon: 'ambulance', color: '#E1F5EE', isPreset: true, members: [{ id: 'starter-sickness-ambulance', name: 'Ambulance', phone: '10177', isPreset: true }] },
  { id: 'starter-gbv', name: 'GBV', icon: 'gbv', color: '#EEE8F8', isPreset: true, members: [{ id: 'starter-gbv-command', name: 'GBV Command Centre', phone: '0800428428', isPreset: true }] }
];

function getOwnerId() {
  const session = sessionStore.get();
  if (!session?.isAuthenticated || session.isGuest || !session.user?.id) {
    throw new Error('Sign in to save Lifeline groups to your Bika account.');
  }
  return session.user.id;
}

export async function getLifelineCards() {
  const cards = await listLifelineCards(getOwnerId());
  return { cards: mergeLifelineCards(LIFELINE_STARTER_CARDS, cards) };
}

export async function saveLifelineCard(card) {
  return await saveLifelineCardRecord(getOwnerId(), card);
}

export async function dispatchLifelineGroupCall(groupId, groupMembers, {
  sendInvitations = sendLifelineInvitations,
  callFallback = (id) => invokeFunction(Endpoints.LIFELINE_GROUP_CALL, { groupId: id })
} = {}) {
  if (!Array.isArray(groupMembers) || !groupMembers.length) {
    throw new Error('This Lifeline group has no members to call.');
  }

  const errors = [];
  let invitations = { members: groupMembers, invited: [], failed: [] };
  try {
    invitations = await sendInvitations(groupMembers);
  } catch (error) {
    console.error('[lifeline] in-app invitations failed', error);
    errors.push(error);
  }

  const invited = invitations.invited || [];
  const invitedIds = new Set(invited.map((member) => member.userID));
  const members = (invitations.members || groupMembers).map((member) => ({
    ...member,
    status: member.userId && invitedIds.has(member.userId.replaceAll('-', '')) ? 'ringing' : 'queued'
  }));
  const remainingMembers = members.filter((member) => (
    !member.userId || !invitedIds.has(member.userId.replaceAll('-', ''))
  ));
  let fallback = null;
  let fallbackSucceeded = false;
  if (remainingMembers.length) {
    try {
      fallback = await callFallback(groupId);
      fallbackSucceeded = true;
    } catch (error) {
      console.error('[lifeline] fallback call failed', error);
      errors.push(error);
    }
  }

  if (!invited.length && !fallbackSucceeded) {
    const firstError = errors[0];
    const message = firstError instanceof Error
      ? firstError.message
      : typeof firstError === 'string' ? firstError : '';
    throw new Error(message || 'No one in this group could be reached.');
  }

  lastGroupCall = {
    groupId,
    members,
    invited,
    failed: invitations.failed || [],
    fallback,
    errors
  };
  return lastGroupCall;
}

export function startLifelineGroupCall(groupId, {
  loadCards = getLifelineCards,
  sendInvitations = sendLifelineInvitations,
  callFallback
} = {}) {
  const pending = inFlightGroupCalls.get(groupId);
  if (pending) return pending;

  const operation = Promise.resolve().then(async () => {
    const { cards } = await loadCards();
    const group = cards.find((card) => card.id === groupId);
    if (!group) throw new Error('This Lifeline group could not be found.');
    return dispatchLifelineGroupCall(groupId, group.members || [], {
      sendInvitations,
      ...(callFallback ? { callFallback } : {})
    });
  });
  let tracked;
  tracked = operation.finally(() => {
    if (inFlightGroupCalls.get(groupId) === tracked) inFlightGroupCalls.delete(groupId);
  });
  inFlightGroupCalls.set(groupId, tracked);
  return tracked;
}

export function getLastLifelineGroupCall() {
  return lastGroupCall;
}

export function isLifelineCallSession(session) {
  return Boolean(session?.isAuthenticated && !session.isGuest);
}

export function redirectGuestLifelineCall(session, { showToast, navigate }) {
  if (isLifelineCallSession(session)) return false;
  showToast('Sign in to use Lifeline calls', { type: 'error' });
  navigate('lifeline-home');
  return true;
}

export function withLifelineCallTimeout(callPromise, timeoutMs = 20000) {
  let timeout;
  return Promise.race([
    callPromise,
    new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Lifeline call request timed out.')), timeoutMs);
    })
  ]).finally(() => clearTimeout(timeout));
}
