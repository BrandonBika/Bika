/**
 * @file apps/resident-pwa/src/features/beacon/beacon.client.js
 * Comprehensive reactive state and client API for Beacon feature.
 * Conforms to approved screen flow v7 and beacon-tab-build-prompt.txt.
 */

import { sessionStore } from '../../session.js';
import { Endpoints, invokeFunction } from '@civicneuro/functions-client';
import {
  listBeaconContacts,
  markBeaconContactMessagePrepared,
  saveBeaconContacts,
  getCurrentUser
} from '@civicneuro/supabase-client';
import {
  cancelRequest as cancelRemoteCircleRequest,
  listCircle as listRemoteCircle,
  listRequests as listRemoteCircleRequests,
  respondToRequest as respondToRemoteCircleRequest,
  searchResidents as searchRemoteResidents,
  sendRequest as sendRemoteCircleRequest,
  subscribeToRequests
} from './beacon-circle.client.js';
import {
  createDirect,
  fetchMessages,
  markRead,
  sendLocation as sendRemoteLocation,
  sendPath as sendRemotePath,
  sendText as sendRemoteText,
  subscribeToConversation
} from '../messaging/messaging.client.js';

const STORAGE_KEY = 'civicneuro_beacon_state_v1';
const PENDING_PATH_KEY = 'civicneuro_beacon_pending_path_v1';
const PENDING_PATH_MAX_AGE = 30 * 60 * 1000;
let pendingPathCoordinates = loadPendingBeaconPath();
let circleRefreshPromise = null;
let circleRefreshPending = false;
const conversationIdsByMember = new Map();
const chatRefreshVersions = new Map();

function loadPendingBeaconPath() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_PATH_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    if (
      !Number.isFinite(pending.createdAt)
      || Date.now() - pending.createdAt > PENDING_PATH_MAX_AGE
      || !Array.isArray(pending.coordinates)
      || pending.coordinates.length < 2
      || !pending.coordinates.every((point) => (
        Array.isArray(point)
        && point.length === 2
        && point.every(Number.isFinite)
      ))
    ) {
      sessionStorage.removeItem(PENDING_PATH_KEY);
      return null;
    }
    return pending.coordinates;
  } catch (error) {
    console.warn('Could not restore pending Beacon route:', error);
    return null;
  }
}

function createDefaultState() {
  return {
    currentUser: {
      id: 'me',
      name: 'Kagiso',
      initial: 'K',
      lat: 40,
      lng: 46
    },
    members: [],
    pendingRequests: [],
    activeSession: null,
    contactsPermission: 'prompt', // 'prompt' | 'granted' | 'denied'
    chats: {}
  };
}

let state = loadState();
let sessionExpiryTimer = null;
const listeners = new Set();
scheduleActiveSessionExpiry();
if (state.activeSession) {
  sessionStore.update((session) => ({ ...session, activeSharesCount: 1 }));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Object.hasOwn(parsed, 'activeSession')) {
        const migratedState = { ...parsed };
        delete migratedState.activeSession;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedState));
        } catch (error) {
          console.warn('Could not remove a previous Beacon session from storage:', error);
        }
      }
      const defaults = createDefaultState();
      const mockMemberIds = new Set(['c1', 'c2', 'c3', 'c4', 'c5']);
      const mockRequestIds = new Set(['req-inc-1', 'req-out-1']);
      const savedMembers = Array.isArray(parsed.members)
        ? parsed.members.filter((member) => (
            member
            && !mockMemberIds.has(member.id)
          ))
        : defaults.members;
      const savedRequests = Array.isArray(parsed.pendingRequests)
        ? parsed.pendingRequests.filter((request) => request && !mockRequestIds.has(request.id))
        : defaults.pendingRequests;
      const savedChats = parsed.chats && typeof parsed.chats === 'object'
        ? Object.fromEntries(Object.entries(parsed.chats).filter(([memberId]) => !mockMemberIds.has(memberId)))
        : defaults.chats;
      const migratedState = {
        ...defaults,
        ...parsed,
        members: savedMembers,
        pendingRequests: savedRequests,
        chats: savedChats,
        activeSession: null,
        contactsPermission: parsed.contactsPermission === 'denied' ? 'denied' : 'prompt'
      };
      delete migratedState.contactsList;
      delete migratedState.searchPool;
      const hadMockContacts = (
        (Array.isArray(parsed.members) && savedMembers.length !== parsed.members.length)
        || (Array.isArray(parsed.pendingRequests) && savedRequests.length !== parsed.pendingRequests.length)
        || (Array.isArray(parsed.contactsList) && parsed.contactsList.length > 0)
        || (Array.isArray(parsed.searchPool) && parsed.searchPool.length > 0)
        || (parsed.chats && Object.keys(parsed.chats).some((memberId) => mockMemberIds.has(memberId)))
      );
      if (hadMockContacts) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedState));
        } catch (error) {
          console.warn('Could not remove old Beacon demo contacts from storage:', error);
        }
      }
      return migratedState;
    }
  } catch (err) {
    console.warn('Could not load beacon state from storage:', err);
  }
  return createDefaultState();
}

function saveState() {
  try {
    const persistentState = { ...state };
    delete persistentState.activeSession;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentState));
  } catch (err) {
    console.warn('Could not save beacon state to storage:', err);
  }
  notify();
}

function notify() {
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (e) {
      console.error(e);
    }
  }
}

export function subscribeBeacon(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBeaconState() {
  return state;
}

function isAuthenticatedResident() {
  const session = sessionStore.get();
  return Boolean(
    session?.isAuthenticated
    && !session.isGuest
    && session.user?.id
    && getCurrentUser()?.id === session.user.id
  );
}

function toBeaconMember(member) {
  return {
    id: member.id,
    name: member.name,
    initial: member.initial,
    isSharing: false,
    statusText: 'Not sharing',
    destination: null,
    eta: null,
    isOffPath: false
  };
}

export async function refreshBeaconCircle() {
  if (!isAuthenticatedResident()) {
    return { members: [...state.members], requests: [...state.pendingRequests] };
  }
  if (circleRefreshPromise) {
    circleRefreshPending = true;
    return circleRefreshPromise;
  }

  circleRefreshPromise = (async () => {
    let result;
    do {
      circleRefreshPending = false;
      const [members, requests] = await Promise.all([
        listRemoteCircle(),
        listRemoteCircleRequests()
      ]);
      state.members = members.map(toBeaconMember);
      state.pendingRequests = requests;
      saveState();
      result = { members: [...state.members], requests: [...state.pendingRequests] };
    } while (circleRefreshPending);
    return result;
  })();
  try {
    return await circleRefreshPromise;
  } finally {
    circleRefreshPromise = null;
    circleRefreshPending = false;
  }
}

export function subscribeBeaconCircle(onError = console.error) {
  if (!isAuthenticatedResident()) return () => {};
  const refresh = () => {
    refreshBeaconCircle().catch(onError);
  };
  const subscription = subscribeToRequests(refresh, onError, refresh);
  subscription.ready.catch(onError);
  return () => subscription.unsubscribe();
}

function getBeaconContactOwnerId() {
  const session = sessionStore.get();
  if (!session?.isAuthenticated || session.isGuest || !session.user?.id) {
    throw new Error('Sign in to save Beacon contacts to your CivicNeuro account.');
  }
  return session.user.id;
}

export function getSavedBeaconContacts() {
  return listBeaconContacts(getBeaconContactOwnerId());
}

export function saveBeaconContactsToAccount(contacts) {
  return saveBeaconContacts(getBeaconContactOwnerId(), contacts);
}

export function markBeaconContactInvitePrepared(contactId) {
  return markBeaconContactMessagePrepared(getBeaconContactOwnerId(), contactId);
}

export function setPendingBeaconPath(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error('Draw a route before continuing.');
  }
  const copiedCoordinates = coordinates.map((point) => [...point]);
  try {
    sessionStorage.setItem(PENDING_PATH_KEY, JSON.stringify({
      createdAt: Date.now(),
      coordinates: copiedCoordinates
    }));
  } catch (error) {
    console.error('Could not save pending Beacon route for this session:', error);
    throw new Error('Your route could not be saved for confirmation. Please try again.');
  }
  pendingPathCoordinates = copiedCoordinates;
}

export function getPendingBeaconPath() {
  return pendingPathCoordinates?.map((point) => [...point]) || null;
}

export function clearPendingBeaconPath() {
  pendingPathCoordinates = null;
  try {
    sessionStorage.removeItem(PENDING_PATH_KEY);
  } catch (error) {
    console.warn('Could not clear pending Beacon route:', error);
  }
}

export async function searchBeaconPlaces(query) {
  const response = await invokeFunction(Endpoints.BEACON_ROUTE, {
    operation: 'search',
    query
  });
  if (!Array.isArray(response?.places)) {
    throw new Error('The place search returned an invalid response.');
  }
  return {
    places: response.places.filter((place) => (
      place
      && typeof place.id === 'string'
      && typeof place.name === 'string'
      && Number.isFinite(place.lat)
      && place.lat >= -90
      && place.lat <= 90
      && Number.isFinite(place.lng)
      && place.lng >= -180
      && place.lng <= 180
    )),
    mock: response.mock === true
  };
}

export async function getBeaconWalkingRoute(origin, destination) {
  const response = await invokeFunction(Endpoints.BEACON_ROUTE, {
    operation: 'route',
    origin,
    destination
  });
  if (
    !Array.isArray(response?.coordinates)
    || response.coordinates.length < 2
    || !response.coordinates.every((point) => (
      Array.isArray(point)
      && point.length === 2
      && Number.isFinite(point[0])
      && point[0] >= -90
      && point[0] <= 90
      && Number.isFinite(point[1])
      && point[1] >= -180
      && point[1] <= 180
    ))
    || !Number.isFinite(response.distanceMeters)
    || !Number.isFinite(response.durationSeconds)
  ) {
    throw new Error('The route service returned an invalid route.');
  }
  return {
    coordinates: response.coordinates,
    distanceMeters: response.distanceMeters,
    durationSeconds: response.durationSeconds,
    mock: response.mock === true
  };
}

// Circle members
export async function getCircleMembers() {
  await refreshBeaconCircle();
  return { members: [...state.members] };
}

export function getMemberById(id) {
  return state.members.find((m) => m.id === id) || null;
}

// Circle Requests
export async function getCircleRequests() {
  await refreshBeaconCircle();
  return { requests: [...state.pendingRequests] };
}

export async function sendCircleRequest(target) {
  const residentId = typeof target === 'string' ? target : target?.id;
  if (!residentId) throw new TypeError('A resident ID is required to send a circle request.');
  const requestId = await sendRemoteCircleRequest(residentId);
  await refreshBeaconCircle();
  const request = state.pendingRequests.find((item) => item.id === requestId) || null;
  return { duplicate: false, request, reason: null };
}

export async function acceptCircleRequest(requestId) {
  await respondToRemoteCircleRequest(requestId, true);
  await refreshBeaconCircle();
  return true;
}

export async function declineCircleRequest(requestId) {
  await respondToRemoteCircleRequest(requestId, false);
  await refreshBeaconCircle();
  return true;
}

export async function cancelCircleRequest(requestId) {
  await cancelRemoteCircleRequest(requestId);
  await refreshBeaconCircle();
  return true;
}

// Search
export async function searchResidents(query) {
  return searchRemoteResidents(query);
}

// Active Sharing Session (Screen D, D2)
export function getActiveSession() {
  return state.activeSession;
}

export async function startActiveSession({
  mode = 'path',
  destination = 'Musgrave Centre',
  duration = 'Until I arrive',
  offPathAlert = true,
  memberIds = [],
  pathCoordinates = null,
  distance = '1.4 km',
  timeEstimate = '18 min',
  eta = '6:52 PM',
  initialAccuracyMeters = null,
  startedWithReducedAccuracy = false
}) {
  const session = {
    id: `session-${Date.now()}`,
    mode,
    destination: typeof destination === 'string' ? destination : (destination?.name || 'Destination'),
    duration,
    offPathAlert,
    memberIds: [...memberIds],
    pathCoordinates: pathCoordinates || [
      { x: 60, y: 385 },
      { x: 80, y: 340 },
      { x: 130, y: 325 },
      { x: 140, y: 285 },
      { x: 95, y: 235 },
      { x: 150, y: 215 },
      { x: 235, y: 205 },
      { x: 225, y: 165 }
    ],
    distance,
    timeEstimate,
    eta,
    initialAccuracyMeters: Number.isFinite(initialAccuracyMeters) ? initialAccuracyMeters : null,
    reducedAccuracy: startedWithReducedAccuracy,
    isOffPath: false,
    offPathDistance: '140 m',
    startedAt: Date.now()
  };

  state.activeSession = session;
  scheduleActiveSessionExpiry();

  // Post "Live location started" system card into each selected member's chat
  for (const memberId of session.memberIds) {
    postChatMessage(memberId, {
      sender: 'system',
      kind: 'live_started',
      label: 'Live location started',
      sub: `You started sharing your ${mode === 'path' ? `walk to ${session.destination}` : 'live location'} · ETA ${session.eta}`,
      time: formatCurrentTime()
    });
  }

  // Update sessionStore to reflect active sharing badge
  sessionStore.update((s) => ({ ...s, activeSharesCount: 1 }));
  saveState();
  return session;
}

export async function stopActiveSession(reason = 'stopped') {
  if (!state.activeSession) return;
  const session = state.activeSession;
  state.activeSession = null;
  clearTimeout(sessionExpiryTimer);
  sessionExpiryTimer = null;

  const endMessage = {
    arrived: {
      label: 'Arrived at destination',
      sub: `The walk to ${session.destination} is complete.`
    },
    timer: {
      label: 'Sharing time ended',
      sub: 'Your Beacon sharing time limit has ended.'
    },
    stopped: {
      label: 'Live location ended',
      sub: 'Location sharing session ended.'
    }
  }[reason] || {
    label: 'Live location ended',
    sub: 'Location sharing session ended.'
  };

  for (const memberId of session.memberIds) {
    postChatMessage(memberId, {
      sender: 'system',
      kind: 'live_ended',
      ...endMessage,
      time: formatCurrentTime()
    });
  }

  sessionStore.update((s) => ({ ...s, activeSharesCount: 0 }));
  saveState();
}

function scheduleActiveSessionExpiry() {
  clearTimeout(sessionExpiryTimer);
  sessionExpiryTimer = null;

  const session = state.activeSession;
  if (!session) return;

  const durationMs = {
    '30 min': 30 * 60 * 1000,
    '1 hour': 60 * 60 * 1000,
    '2 hours': 2 * 60 * 60 * 1000
  }[session.duration];
  if (!durationMs) return;

  const endsAt = (session.startedAt || Date.now()) + durationMs;
  const remainingMs = endsAt - Date.now();
  if (remainingMs <= 0) {
    stopActiveSession('timer');
    return;
  }

  const sessionId = session.id;
  sessionExpiryTimer = setTimeout(() => {
    if (state.activeSession?.id === sessionId) {
      stopActiveSession('timer');
    }
  }, remainingMs);
}

export function setSessionOffPath(isOff, distanceMeters) {
  if (!state.activeSession) return;
  const wasOffPath = state.activeSession.isOffPath;
  state.activeSession.isOffPath = isOff;

  if (isOff && Number.isFinite(distanceMeters)) {
    state.activeSession.offPathDistance = `${Math.round(distanceMeters)} m`;
  } else if (!isOff) {
    delete state.activeSession.offPathDistance;
  }

  if (isOff && !wasOffPath && state.activeSession.offPathAlert) {
    for (const memberId of state.activeSession.memberIds) {
      postChatMessage(memberId, {
        sender: 'system',
        kind: 'off_path',
        label: 'LEFT PATH',
        sub: state.activeSession.offPathDistance
          ? `A member is approximately ${state.activeSession.offPathDistance} off the planned route`
          : 'A member is off the planned route',
        time: formatCurrentTime()
      });
    }
  }
  saveState();
}

export function updateSessionPath(newCoordinates, distance, timeEstimate) {
  if (!state.activeSession) return;
  state.activeSession.pathCoordinates = newCoordinates;
  if (distance) state.activeSession.distance = distance;
  if (timeEstimate) state.activeSession.timeEstimate = timeEstimate;
  state.activeSession.isOffPath = false;

  for (const memberId of state.activeSession.memberIds) {
    postChatMessage(memberId, {
      sender: 'system',
      kind: 'path_updated',
      label: 'ROUTE UPDATED',
      sub: 'Kagiso updated the route',
      time: formatCurrentTime()
    });
  }
  saveState();
}

// Chat operations
export function getChatMessages(memberId) {
  return state.chats[memberId] || [];
}

function toBeaconChatMessage(message) {
  const senderId = getCurrentUser()?.id;
  const type = message.type;
  let text = message.body || '';
  if (type === 'location' && message.payload) {
    text = `Location shared: ${message.payload.lat}, ${message.payload.lng}`;
  } else if (type === 'path' && Array.isArray(message.payload?.points)) {
    text = `Route shared (${message.payload.points.length} points)`;
  }
  return {
    id: message.id,
    sender: type === 'system' ? 'system' : message.sender_id === senderId ? 'me' : 'them',
    kind: type,
    text,
    time: formatMessageTime(message.created_at),
    payload: message.payload,
    label: type === 'system' ? message.body : undefined
  };
}

function formatMessageTime(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export async function refreshChatMessages(memberId) {
  const version = (chatRefreshVersions.get(memberId) || 0) + 1;
  chatRefreshVersions.set(memberId, version);
  const conversationId = conversationIdsByMember.get(memberId) || await createDirect(memberId);
  conversationIdsByMember.set(memberId, conversationId);
  const rows = await fetchMessages(conversationId, null, 100);
  if (version !== chatRefreshVersions.get(memberId)) {
    return state.chats[memberId] || [];
  }
  const messages = rows.reverse().map(toBeaconChatMessage);
  state.chats[memberId] = messages;
  saveState();
  await markRead(conversationId);
  return messages;
}

export async function subscribeToBeaconChat(memberId, onError = console.error) {
  let conversationId = conversationIdsByMember.get(memberId);
  try {
    conversationId ||= await createDirect(memberId);
  } catch (error) {
    onError(error);
    return null;
  }
  conversationIdsByMember.set(memberId, conversationId);
  const subscription = subscribeToConversation(
    conversationId,
    () => {
      refreshChatMessages(memberId).catch(onError);
    },
    onError,
    () => {
      refreshChatMessages(memberId).catch(onError);
    }
  );
  subscription.ready.catch(onError);
  return subscription;
}

export async function sendChatMessage(memberId, text) {
  if (!text || !text.trim()) return null;
  const conversationId = conversationIdsByMember.get(memberId) || await createDirect(memberId);
  conversationIdsByMember.set(memberId, conversationId);
  const saved = await sendRemoteText(conversationId, text.trim());
  await refreshChatMessages(memberId);
  const msg = toBeaconChatMessage(saved);
  saveState();
  return msg;
}

export async function sendChatLocation(memberId, location) {
  const conversationId = conversationIdsByMember.get(memberId) || await createDirect(memberId);
  conversationIdsByMember.set(memberId, conversationId);
  const saved = await sendRemoteLocation(conversationId, location);
  await refreshChatMessages(memberId);
  return toBeaconChatMessage(saved);
}

export async function sendChatPath(memberId, points) {
  const conversationId = conversationIdsByMember.get(memberId) || await createDirect(memberId);
  conversationIdsByMember.set(memberId, conversationId);
  const saved = await sendRemotePath(conversationId, points);
  await refreshChatMessages(memberId);
  return toBeaconChatMessage(saved);
}

function postChatMessage(memberId, message) {
  if (!state.chats[memberId]) {
    state.chats[memberId] = [];
  }
  state.chats[memberId].push(message);
}

// Contacts Permission Flow
export function getContactsPermissionStatus() {
  return state.contactsPermission;
}

export function setContactsPermissionStatus(status) {
  state.contactsPermission = status;
  saveState();
}

function formatCurrentTime() {
  const d = new Date();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

export async function sendBeaconRequest(contact) {
  return sendCircleRequest(contact);
}
export async function startSharingSession(memberId, durationMinutes) {
  return startActiveSession({ memberIds: [memberId], duration: `${durationMinutes} min` });
}
export async function stopSharingSession() {
  return stopActiveSession();
}
