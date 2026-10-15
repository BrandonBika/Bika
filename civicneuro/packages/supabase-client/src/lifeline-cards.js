import { requestSupabase } from './client.js';

const CARD_COLUMNS = 'id,name,icon,color,members,created_at,updated_at';
const ALLOWED_ICONS = new Set(['custom', 'police', 'home', 'gbv', 'ambulance', 'fire']);

function withMigrationGuidance(error) {
  if (error?.code === 'PGRST205' || error?.code === '42P01') {
    throw new Error('Lifeline groups are not set up in Supabase yet. In Supabase Dashboard → SQL Editor, run supabase/migrations/0030_lifeline_cards.sql, then reload this page.');
  }
  throw error;
}

function requireOwnerId(ownerId) {
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new Error('Sign in to save Lifeline groups to your CivicNeuro account.');
  }
  return ownerId;
}

function normalizeCard(card) {
  const name = String(card?.name || '').trim();
  const icon = String(card?.icon || '');
  const color = String(card?.color || '');
  const members = Array.isArray(card?.members) ? card.members : [];
  if (!name || name.length > 100) {
    throw new Error('Enter a group name of 1 to 100 characters.');
  }
  if (!ALLOWED_ICONS.has(icon) || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error('Choose a valid Lifeline group icon and colour.');
  }
  if (members.length < 1 || members.length > 4) {
    throw new Error('A Lifeline group must have between 1 and 4 people.');
  }
  const validatedMembers = members.map((member) => {
    const memberName = String(member?.name || '').trim();
    const phone = String(member?.phone || '').trim();
    const digits = phone.replace(/\D/g, '');
    if (!memberName || memberName.length > 100 || digits.length < 3 || digits.length > 15) {
      throw new Error('Each group member needs a name and a valid phone number.');
    }
    return {
      id: String(member.id || ''),
      name: memberName,
      phone,
      ...(member.isPreset === true ? { isPreset: true } : {})
    };
  });
  const id = String(card.id || `lifeline-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`);
  if (id.length > 100) throw new Error('The Lifeline group identifier is invalid.');
  return { id, name, icon, color, members: validatedMembers };
}

export async function listLifelineCards(ownerId) {
  const query = new URLSearchParams({
    select: CARD_COLUMNS,
    owner_id: `eq.${requireOwnerId(ownerId)}`,
    order: 'created_at.asc'
  });
  let cards;
  try {
    cards = await requestSupabase(`/rest/v1/lifeline_cards?${query}`);
  } catch (error) {
    withMigrationGuidance(error);
  }
  if (!Array.isArray(cards)) throw new Error('The saved Lifeline groups response was invalid.');
  return cards;
}

export async function saveLifelineCard(ownerId, card) {
  const validatedOwnerId = requireOwnerId(ownerId);
  const normalizedCard = normalizeCard(card);
  const query = new URLSearchParams({
    on_conflict: 'owner_id,id',
    select: CARD_COLUMNS
  });
  let cards;
  try {
    cards = await requestSupabase(`/rest/v1/lifeline_cards?${query}`, {
      method: 'POST',
      body: [{ owner_id: validatedOwnerId, ...normalizedCard }],
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
    });
  } catch (error) {
    withMigrationGuidance(error);
  }
  if (!Array.isArray(cards) || cards.length !== 1) {
    throw new Error('Supabase did not confirm that the Lifeline group was saved.');
  }
  return cards[0];
}
