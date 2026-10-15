/**
 * @file apps/resident-pwa/src/features/lifeline/lifeline.client.js
 */
import { invokeFunction, Endpoints } from '@civicneuro/functions-client';
import { listLifelineCards, saveLifelineCard as saveLifelineCardRecord } from '@civicneuro/supabase-client';
import { sessionStore } from '../../session.js';
import { mergeLifelineCards } from './lifeline-groups.js';

let lastGroupCall = null;

export const LIFELINE_STARTER_CARDS = [
  { id: 'starter-crime', name: 'Crime', icon: 'police', color: '#E6F1FB', isPreset: true, members: [{ id: 'starter-crime-saps', name: 'SAPS', phone: '10111', isPreset: true }] },
  { id: 'starter-fire', name: 'Fire', icon: 'fire', color: '#FBE4D3', isPreset: true, members: [{ id: 'starter-fire-department', name: 'Fire Department', phone: '0313610000', isPreset: true }] },
  { id: 'starter-sickness', name: 'Sickness', icon: 'ambulance', color: '#E1F5EE', isPreset: true, members: [{ id: 'starter-sickness-ambulance', name: 'Ambulance', phone: '10177', isPreset: true }] },
  { id: 'starter-gbv', name: 'GBV', icon: 'gbv', color: '#EEE8F8', isPreset: true, members: [{ id: 'starter-gbv-command', name: 'GBV Command Centre', phone: '0800428428', isPreset: true }] }
];

function getOwnerId() {
  const session = sessionStore.get();
  if (!session?.isAuthenticated || session.isGuest || !session.user?.id) {
    throw new Error('Sign in to save Lifeline groups to your CivicNeuro account.');
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

export async function startLifelineGroupCall(groupId) {
  lastGroupCall = await invokeFunction(Endpoints.LIFELINE_GROUP_CALL, { groupId });
  return lastGroupCall;
}

export function getLastLifelineGroupCall() {
  return lastGroupCall;
}
