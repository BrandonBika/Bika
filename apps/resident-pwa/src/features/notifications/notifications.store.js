import { createStore } from '@civicneuro/state';
import { sessionStore } from '../../session.js';
import {
  fetchAlertMessages,
  listConversations,
  markRead,
  subscribeToConversation
} from '../messaging/messaging.client.js';

/**
 * @typedef {'report_status' | 'report_reply' | 'report_resolved' | 'community_notice' | 'service_outage'} NotificationKind
 * @typedef {Object} ResidentNotification
 * @property {string} id
 * @property {NotificationKind} kind
 * @property {string} title
 * @property {string} body
 * @property {string} createdAt
 * @property {string|null} readAt
 * @property {string} [reportRef]
 */

function dateAt(dayOffset, hour, minute) {
  const date = new Date();
  date.setDate(date.getDate() - dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/** @type {ResidentNotification[]} */
const NOTIFICATION_FIXTURES = [
  {
    id: 'notification-reply-04452',
    kind: 'report_reply',
    title: 'New reply from eThekwini Roads Dept',
    body: '“Thanks for the details — a crew has been assigned and will inspect within 48 hours.”',
    createdAt: dateAt(0, 10, 22),
    readAt: null,
    reportRef: 'CN-2026-04452'
  },
  {
    id: 'notification-status-04452',
    kind: 'report_status',
    title: 'CN-2026-04452 moved to Under review',
    body: 'Your pothole cluster report is now being reviewed by eThekwini Roads Dept.',
    createdAt: dateAt(0, 9, 15),
    readAt: null,
    reportRef: 'CN-2026-04452'
  },
  {
    id: 'notification-community-loadshedding',
    kind: 'community_notice',
    title: 'Load shedding schedule updated',
    body: 'Stage 2 load shedding now applies to Ward 12 from 6 September.',
    createdAt: dateAt(0, 7, 0),
    readAt: dateAt(0, 7, 0)
  },
  {
    id: 'notification-resolved-04289',
    kind: 'report_resolved',
    title: 'CN-2026-04289 marked as Resolved',
    body: 'Blocked stormwater drain on Musgrave Rd has been cleared.',
    createdAt: dateAt(3, 16, 40),
    readAt: dateAt(3, 16, 40),
    reportRef: 'CN-2026-04289'
  },
  {
    id: 'notification-outage-musgrave',
    kind: 'service_outage',
    title: 'Water outage: Musgrave Rd',
    body: 'Planned maintenance completed. Supply has been fully restored.',
    createdAt: dateAt(4, 8, 12),
    readAt: dateAt(4, 8, 12)
  },
  {
    id: 'notification-status-04398',
    kind: 'report_status',
    title: 'CN-2026-04398 moved to In progress',
    body: 'A technician has been dispatched to fix the streetlight on Ridge Rd.',
    createdAt: dateAt(5, 13, 5),
    readAt: dateAt(5, 13, 5),
    reportRef: 'CN-2026-04398'
  }
];

const LOCAL_READ_STATE_KEY = 'civicneuro_notifications_read_v1';

function readLocalReadState() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(LOCAL_READ_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    console.warn('Could not restore local notification read state:', error);
    return {};
  }
}

function persistLocalReadState(notifications) {
  try {
    if (typeof localStorage === 'undefined') return;
    const readState = Object.fromEntries(notifications
      .filter((notification) => !notification.isMessagingAlert && notification.readAt)
      .map((notification) => [notification.id, notification.readAt]));
    localStorage.setItem(LOCAL_READ_STATE_KEY, JSON.stringify(readState));
  } catch (error) {
    console.warn('Could not persist local notification read state:', error);
  }
}

const localReadState = readLocalReadState();
const localNotifications = NOTIFICATION_FIXTURES.map((notification) => ({
  ...notification,
  readAt: localReadState[notification.id] || notification.readAt
}));

function restoreLocalNotifications(currentNotifications) {
  const currentById = new Map(currentNotifications
    .filter((notification) => !notification.isMessagingAlert)
    .map((notification) => [notification.id, notification]));
  const savedReadState = readLocalReadState();
  return NOTIFICATION_FIXTURES.map((fixture) => ({
    ...fixture,
    readAt: currentById.get(fixture.id)?.readAt
      || savedReadState[fixture.id]
      || fixture.readAt
  }));
}

export const notificationsStore = createStore({
  notifications: localNotifications
});

let messagingAlertRefreshVersion = 0;
const messagingAlertConversations = new Map();

function replaceMessagingAlerts(alerts) {
  notificationsStore.update((state) => {
    const session = sessionStore.get();
    const localNotifications = session.isAuthenticated && !session.isGuest
      ? []
      : restoreLocalNotifications(state.notifications);
    return {
      ...state,
      notifications: [...localNotifications, ...alerts].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      )
    };
  });
}

export function prepareNotificationsForSession() {
  const session = sessionStore.get();
  if (!session.isAuthenticated || session.isGuest) return;
  notificationsStore.update((state) => ({
    ...state,
    notifications: state.notifications.filter((notification) => (
      notification.isMessagingAlert === true
    ))
  }));
}

export async function refreshMessagingAlerts() {
  const session = sessionStore.get();
  if (!session.isAuthenticated || session.isGuest) {
    messagingAlertRefreshVersion += 1;
    messagingAlertConversations.clear();
    replaceMessagingAlerts([]);
    return [];
  }

  const version = ++messagingAlertRefreshVersion;
  const conversations = await listConversations();
  const alertRows = await Promise.all(conversations.map(async (conversation) => ({
    conversation,
    messages: await fetchAlertMessages(conversation.id)
  })));
  if (version !== messagingAlertRefreshVersion) return getNotifications();

  const alerts = alertRows.flatMap(({ conversation, messages }) => messages.map((message) => {
    const previous = notificationsStore.get().notifications.find(
      (notification) => notification.id === `messaging-alert-${message.id}`
    );
    const readAt = conversation.last_read_at
      && Date.parse(conversation.last_read_at) >= Date.parse(message.created_at)
      ? conversation.last_read_at
      : previous?.readAt || null;
    messagingAlertConversations.set(`messaging-alert-${message.id}`, conversation.id);
    return {
      id: `messaging-alert-${message.id}`,
      kind: 'community_notice',
      title: 'Beacon alert',
      body: message.body || 'A Beacon alert was shared.',
      createdAt: message.created_at,
      readAt,
      conversationId: conversation.id,
      isMessagingAlert: true
    };
  }));
  replaceMessagingAlerts(alerts);
  return alerts;
}

export async function subscribeToMessagingAlerts(onError = console.error) {
  const session = sessionStore.get();
  if (!session.isAuthenticated || session.isGuest) {
    return { ready: Promise.resolve(), unsubscribe() {} };
  }

  const conversations = await listConversations();
  const refresh = () => {
    refreshMessagingAlerts().catch(onError);
  };
  const subscriptions = conversations.map((conversation) => subscribeToConversation(
    conversation.id,
    refresh,
    onError,
    refresh
  ));
  return {
    ready: Promise.all(subscriptions.map((subscription) => subscription.ready)),
    unsubscribe() {
      for (const subscription of subscriptions) subscription.unsubscribe();
    }
  };
}

export async function markMessagingAlertRead(id) {
  const conversationId = messagingAlertConversations.get(id);
  if (!conversationId) return;
  await markRead(conversationId);
  await refreshMessagingAlerts();
}

export async function markAllMessagingAlertsRead() {
  const session = sessionStore.get();
  if (!session.isAuthenticated || session.isGuest) return;
  const conversations = await listConversations();
  await Promise.all(conversations.map(({ id }) => markRead(id)));
  await refreshMessagingAlerts();
}

export function getNotifications() {
  return notificationsStore.get().notifications;
}

export function getUnreadNotificationCount() {
  return getNotifications().filter((notification) => !notification.readAt).length;
}

export function markNotificationRead(id) {
  notificationsStore.update((state) => {
    const notifications = state.notifications.map((notification) => (
      notification.id === id && !notification.readAt
        ? { ...notification, readAt: new Date().toISOString() }
        : notification
    ));
    persistLocalReadState(notifications);
    return { ...state, notifications };
  });
}

export function markAllNotificationsRead() {
  const readAt = new Date().toISOString();
  notificationsStore.update((state) => {
    const notifications = state.notifications.map((notification) => (
      notification.readAt ? notification : { ...notification, readAt }
    ));
    persistLocalReadState(notifications);
    return { ...state, notifications };
  });
}

export function addNotification(notification) {
  if (!notification?.id || !notification?.kind || !notification?.title || !notification?.body) {
    throw new TypeError('A notification requires an id, kind, title, and body.');
  }
  const kinds = ['report_status', 'report_reply', 'report_resolved', 'community_notice', 'service_outage'];
  if (!kinds.includes(notification.kind)) {
    throw new TypeError(`Unsupported notification kind: ${notification.kind}`);
  }
  if (!Number.isFinite(Date.parse(notification.createdAt))) {
    throw new TypeError('A notification requires a valid createdAt date.');
  }

  notificationsStore.update((state) => {
    const notifications = [
      { ...notification, readAt: notification.readAt || null },
      ...state.notifications.filter((item) => item.id !== notification.id)
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    persistLocalReadState(notifications);
    return { ...state, notifications };
  });
}
