import { requestSupabase } from './client.js';

function requireOwnerId(ownerId) {
  if (typeof ownerId !== 'string' || !ownerId.trim()) {
    throw new Error('Sign in to save Beacon contacts to your Bika account.');
  }
  return ownerId;
}

function normalizeContact(contact) {
  const name = String(contact?.name || '').trim();
  const phone = String(contact?.phone || '').trim();
  const digits = phone.replace(/\D/g, '');
  if (!name || name.length > 100 || digits.length < 7 || digits.length > 15) {
    throw new Error('Each Beacon contact must have a name and a valid phone number.');
  }
  return { name, phone, phone_normalized: digits };
}

export async function listBeaconContacts(ownerId) {
  const query = new URLSearchParams({
    select: 'id,name,phone,phone_normalized,invitation_status,message_prepared_at,created_at',
    owner_id: `eq.${requireOwnerId(ownerId)}`,
    order: 'created_at.asc'
  });
  const contacts = await requestSupabase(`/rest/v1/beacon_contacts?${query}`);
  if (!Array.isArray(contacts)) {
    throw new Error('The saved Beacon contacts response was invalid.');
  }
  return contacts;
}

export async function saveBeaconContacts(ownerId, contacts) {
  const validatedOwnerId = requireOwnerId(ownerId);
  if (!Array.isArray(contacts) || contacts.length === 0) return [];

  const uniqueContacts = new Map();
  for (const contact of contacts) {
    const normalized = normalizeContact(contact);
    uniqueContacts.set(normalized.phone_normalized, normalized);
  }
  const query = new URLSearchParams({
    on_conflict: 'owner_id,phone_normalized',
    select: 'id,name,phone,phone_normalized,invitation_status,message_prepared_at,created_at'
  });
  const rows = await requestSupabase(`/rest/v1/beacon_contacts?${query}`, {
    method: 'POST',
    body: [...uniqueContacts.values()].map((contact) => ({
      owner_id: validatedOwnerId,
      ...contact
    })),
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
  });
  if (!Array.isArray(rows)) {
    throw new Error('The saved Beacon contacts response was invalid.');
  }
  return rows;
}

export async function markBeaconContactMessagePrepared(ownerId, contactId) {
  const validatedOwnerId = requireOwnerId(ownerId);
  if (typeof contactId !== 'string' || !contactId.trim()) {
    throw new Error('The Beacon contact could not be identified.');
  }
  const query = new URLSearchParams({
    id: `eq.${contactId}`,
    owner_id: `eq.${validatedOwnerId}`,
    select: 'id,name,phone,phone_normalized,invitation_status,message_prepared_at,created_at'
  });
  const rows = await requestSupabase(`/rest/v1/beacon_contacts?${query}`, {
    method: 'PATCH',
    body: {
      invitation_status: 'message_prepared',
      message_prepared_at: new Date().toISOString()
    },
    headers: { Prefer: 'return=representation' }
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('The Beacon contact could not be updated. Refresh your contacts and try again.');
  }
  return rows[0];
}
