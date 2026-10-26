/**
 * @file apps/resident-pwa/src/features/beacon/beacon-circle.client.js
 * Supabase-backed Beacon resident search, circle requests, and connections.
 */
import {
  getCurrentUser,
  requestSupabase,
  subscribeToPostgresChanges
} from '@civicneuro/supabase-client';

function requireUserId() {
  const userId = getCurrentUser()?.id;
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Sign in to manage your Beacon circle.');
  }
  return userId;
}

function requireId(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} is required.`);
  }
  return value.trim();
}

async function callRpc(name, body) {
  requireUserId();
  return requestSupabase(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function searchResidents(query) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new TypeError('A resident name or full phone number is required.');
  }
  const rows = await callRpc('search_residents', { p_query: query.trim() });
  if (!Array.isArray(rows)) {
    throw new Error('Resident search returned an invalid response.');
  }
  return rows.map((row) => ({
    id: row.user_id,
    name: row.display_name,
    initial: row.display_name?.trim()?.charAt(0)?.toUpperCase() || ''
  }));
}

export async function sendRequest(targetId) {
  const userId = requireUserId();
  const target = requireId(targetId, 'Resident ID');
  if (target === userId) throw new TypeError('You cannot request yourself.');
  return callRpc('send_circle_request', { p_target_id: target });
}

export async function respondToRequest(requestId, accept) {
  if (typeof accept !== 'boolean') {
    throw new TypeError('The request response must be accept or decline.');
  }
  return callRpc('respond_circle_request', {
    p_request_id: requireId(requestId, 'Request ID'),
    p_accept: accept
  });
}

export async function cancelRequest(requestId) {
  return callRpc('cancel_circle_request', {
    p_request_id: requireId(requestId, 'Request ID')
  });
}

export async function removeConnection(otherUserId) {
  const userId = requireUserId();
  const otherId = requireId(otherUserId, 'Resident ID');
  if (otherId === userId) throw new TypeError('You cannot remove yourself.');
  return callRpc('remove_connection', { p_other_user_id: otherId });
}

export async function block(otherUserId) {
  const userId = requireUserId();
  const otherId = requireId(otherUserId, 'Resident ID');
  if (otherId === userId) throw new TypeError('You cannot block yourself.');
  return callRpc('block_user', { p_other_user_id: otherId });
}

export async function unblock(otherUserId) {
  const userId = requireUserId();
  const otherId = requireId(otherUserId, 'Resident ID');
  if (otherId === userId) throw new TypeError('You cannot unblock yourself.');
  return callRpc('unblock_user', { p_other_user_id: otherId });
}

export async function listCircle() {
  const rows = await callRpc('list_circle', {});
  if (!Array.isArray(rows)) throw new Error('Beacon circle returned an invalid response.');
  return rows.map((row) => ({
    id: row.user_id,
    name: row.display_name,
    initial: row.display_name?.trim()?.charAt(0)?.toUpperCase() || ''
  }));
}

export async function listRequests() {
  const rows = await callRpc('list_circle_requests', {});
  if (!Array.isArray(rows)) throw new Error('Beacon requests returned an invalid response.');
  return rows.map((row) => ({
    id: row.request_id,
    userId: row.user_id,
    name: row.display_name,
    initial: row.display_name?.trim()?.charAt(0)?.toUpperCase() || '',
    status: row.status,
    direction: row.direction,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    meta: row.direction === 'incoming' ? 'Wants to share with you' : 'Request sent · awaiting accept'
  }));
}

export function countIncomingPendingRequests(requests) {
  if (!Array.isArray(requests)) {
    throw new TypeError('Beacon requests must be an array.');
  }
  return requests.filter((request) => (
    request?.direction === 'incoming' && request.status === 'pending'
  )).length;
}

export function subscribeToRequests(onChange, onError, onSubscribed) {
  const userId = requireUserId();
  if (typeof onChange !== 'function') {
    throw new TypeError('A Beacon request change callback is required.');
  }
  return subscribeToPostgresChanges({
    topic: `beacon-requests:${userId}`,
    changes: [
      {
        event: '*',
        schema: 'public',
        table: 'beacon_connections'
      }
    ],
    onChange,
    ...(onError ? { onError } : {}),
    ...(onSubscribed ? { onSubscribed } : {})
  });
}

export async function setDiscoverable(discoverable) {
  if (typeof discoverable !== 'boolean') {
    throw new TypeError('Discoverability must be a boolean.');
  }
  return callRpc('set_beacon_discoverable', { p_discoverable: discoverable });
}
