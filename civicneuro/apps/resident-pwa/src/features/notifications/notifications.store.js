import { createStore } from '@civicneuro/state';

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

export const notificationsStore = createStore({
  notifications: NOTIFICATION_FIXTURES
});

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
    return { ...state, notifications };
  });
}

export function markAllNotificationsRead() {
  const readAt = new Date().toISOString();
  notificationsStore.update((state) => ({
    ...state,
    notifications: state.notifications.map((notification) => (
      notification.readAt ? notification : { ...notification, readAt }
    ))
  }));
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

  notificationsStore.update((state) => ({
    ...state,
    notifications: [
      { ...notification, readAt: notification.readAt || null },
      ...state.notifications.filter((item) => item.id !== notification.id)
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }));
}
