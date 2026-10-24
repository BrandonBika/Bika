/**
 * @file apps/resident-pwa/src/features/messaging/messaging.client.js
 * Supabase-backed resident conversations, messages, and Realtime subscriptions.
 */
import {
  getCurrentUser,
  requestSupabase,
  subscribeToPostgresChanges
} from '@civicneuro/supabase-client';

const MAX_PAGE_SIZE = 100;
const MAX_PATH_POINTS = 1000;

function requireId(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} is required.`);
  }
  return value.trim();
}

function requireCurrentUserId() {
  const userId = getCurrentUser()?.id;
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Sign in to use resident messaging.');
  }
  return userId;
}

async function callRpc(name, args) {
  return requestSupabase(`/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: args,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function insertMessage(conversationId, type, body, payload = null) {
  requireCurrentUserId();
  const rows = await requestSupabase('/rest/v1/messages?select=*', {
    method: 'POST',
    body: {
      conversation_id: requireId(conversationId, 'Conversation ID'),
      type,
      body,
      payload
    },
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    }
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('Supabase did not return the saved message.');
  }
  return rows[0];
}

function isCoordinatePair(point) {
  return Array.isArray(point)
    && point.length === 2
    && Number.isFinite(point[0])
    && point[0] >= -90
    && point[0] <= 90
    && Number.isFinite(point[1])
    && point[1] >= -180
    && point[1] <= 180;
}

export async function createDirect(otherUserId) {
  const otherId = requireId(otherUserId, 'Other resident ID');
  if (otherId === requireCurrentUserId()) {
    throw new TypeError('You cannot start a direct conversation with yourself.');
  }
  return callRpc('create_direct_conversation', { p_other_user_id: otherId });
}

export async function createGroup(title, memberIds) {
  requireCurrentUserId();
  if (typeof title !== 'string' || !title.trim()) {
    throw new TypeError('A group title is required.');
  }
  if (!Array.isArray(memberIds) || memberIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new TypeError('Group members must be resident IDs.');
  }
  return callRpc('create_group_conversation', {
    p_title: title.trim(),
    p_member_ids: memberIds.map((id) => id.trim())
  });
}

export async function addGroupMember(conversationId, userId) {
  requireCurrentUserId();
  return callRpc('add_group_member', {
    p_conversation_id: requireId(conversationId, 'Conversation ID'),
    p_user_id: requireId(userId, 'Resident ID')
  });
}

export async function leaveConversation(conversationId) {
  requireCurrentUserId();
  return callRpc('leave_conversation', {
    p_conversation_id: requireId(conversationId, 'Conversation ID')
  });
}

export async function listConversations() {
  const userId = requireCurrentUserId();
  const query = new URLSearchParams({
    select: 'conversation_id,role,joined_at,last_read_at,conversation:conversations!inner(id,kind,title,created_by,created_at)',
    user_id: `eq.${userId}`,
    order: 'joined_at.desc'
  });
  const rows = await requestSupabase(`/rest/v1/conversation_members?${query}`);
  return rows.map((row) => ({
    ...row.conversation,
    role: row.role,
    joined_at: row.joined_at,
    last_read_at: row.last_read_at
  }));
}

export async function fetchMessages(conversationId, before = null, limit = 50) {
  requireCurrentUserId();
  const id = requireId(conversationId, 'Conversation ID');
  const pageSize = Number(limit);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new RangeError(`Message page size must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  const filters = new URLSearchParams({
    select: 'id,conversation_id,sender_id,type,body,payload,created_at',
    conversation_id: `eq.${id}`,
    order: 'created_at.desc,id.desc',
    limit: String(pageSize)
  });
  if (before !== null) {
    if (typeof before === 'string' && Number.isFinite(Date.parse(before))) {
      filters.set('created_at', `lt.${new Date(before).toISOString()}`);
    } else if (before && typeof before === 'object'
        && typeof before.created_at === 'string'
        && Number.isFinite(Date.parse(before.created_at))
        && typeof before.id === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(before.id)) {
      const timestamp = new Date(before.created_at).toISOString();
      filters.set('or', `(created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${before.id}))`);
    } else {
      throw new TypeError('Message cursor must be a valid timestamp or message row.');
    }
  }
  return requestSupabase(`/rest/v1/messages?${filters}`);
}

export async function fetchAlertMessages(conversationId, limit = MAX_PAGE_SIZE) {
  requireCurrentUserId();
  const id = requireId(conversationId, 'Conversation ID');
  const pageSize = Number(limit);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new RangeError(`Alert page size must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  const filters = new URLSearchParams({
    select: 'id,conversation_id,sender_id,type,body,payload,created_at',
    conversation_id: `eq.${id}`,
    type: 'eq.alert',
    order: 'created_at.desc,id.desc',
    limit: String(pageSize)
  });
  return requestSupabase(`/rest/v1/messages?${filters}`);
}

export async function sendText(conversationId, body) {
  if (typeof body !== 'string' || !body.trim() || body.trim().length > 4000) {
    throw new TypeError('Text messages must contain 1 to 4000 characters.');
  }
  return insertMessage(conversationId, 'text', body.trim());
}

export async function sendAlert(conversationId, body) {
  if (typeof body !== 'string' || !body.trim() || body.trim().length > 4000) {
    throw new TypeError('Alerts must contain 1 to 4000 characters.');
  }
  return insertMessage(conversationId, 'alert', body.trim());
}

export async function sendLocation(conversationId, location) {
  if (!location || !Number.isFinite(location.lat) || location.lat < -90 || location.lat > 90
      || !Number.isFinite(location.lng) || location.lng < -180 || location.lng > 180
      || (location.accuracy !== undefined
        && (!Number.isFinite(location.accuracy) || location.accuracy < 0))) {
    throw new TypeError('Location must include valid latitude and longitude coordinates.');
  }
  const payload = {
    lat: location.lat,
    lng: location.lng,
    ...(location.accuracy === undefined ? {} : { accuracy: location.accuracy })
  };
  return insertMessage(conversationId, 'location', null, payload);
}

export async function sendPath(conversationId, points) {
  if (!Array.isArray(points)
      || points.length < 2
      || points.length > MAX_PATH_POINTS
      || !points.every(isCoordinatePair)) {
    throw new TypeError(`Paths must contain 2 to ${MAX_PATH_POINTS} valid [latitude, longitude] points.`);
  }
  return insertMessage(conversationId, 'path', null, { points });
}

export async function markRead(conversationId) {
  requireCurrentUserId();
  return callRpc('mark_conversation_read', {
    p_conversation_id: requireId(conversationId, 'Conversation ID')
  });
}

export function subscribeToConversation(conversationId, onMessage, onError, onSubscribed) {
  requireCurrentUserId();
  if (typeof onMessage !== 'function') {
    throw new TypeError('A message callback is required.');
  }
  const id = requireId(conversationId, 'Conversation ID');
  return subscribeToPostgresChanges({
    topic: `conversation:${id}`,
    changes: [
      {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${id}`
      },
      {
        event: '*',
        schema: 'public',
        table: 'conversation_members',
        filter: `conversation_id=eq.${id}`
      }
    ],
    onChange: onMessage,
    ...(onError ? { onError } : {}),
    ...(onSubscribed ? { onSubscribed } : {})
  });
}

export function unsubscribe(subscription) {
  if (!subscription || typeof subscription.unsubscribe !== 'function') {
    throw new TypeError('A Realtime subscription handle is required.');
  }
  subscription.unsubscribe();
}
