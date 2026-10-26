/**
 * @file apps/resident-pwa/src/pages/notifications/notifications.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { createEmptyState } from '../../components/empty-state/empty-state.js';
import {
  getNotifications,
  markAllNotificationsRead,
  markAllMessagingAlertsRead,
  markNotificationRead,
  markMessagingAlertRead,
  prepareNotificationsForSession,
  refreshMessagingAlerts,
  subscribeToMessagingAlerts,
  notificationsStore
} from '../../features/notifications/notifications.store.js';
import {
  getIncomingPendingCount,
  subscribeIncomingPendingCount
} from '../../features/beacon/beacon.client.js';
import { navigate } from '../../router.js';

const REPORT_KINDS = new Set(['report_status', 'report_reply', 'report_resolved']);
const COMMUNITY_KINDS = new Set(['community_notice', 'service_outage']);

const ICONS = {
  report_status: {
    color: 'blue',
    paths: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6']
  },
  report_reply: {
    color: 'teal',
    paths: ['M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z']
  },
  report_resolved: {
    color: 'teal',
    paths: ['M22 11.1V12a10 10 0 1 1-5.9-9.1', 'M22 4 12 14.01l-3-3']
  },
  community_notice: {
    color: 'amber',
    paths: ['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M10 21h4']
  },
  service_outage: {
    color: 'red',
    paths: ['M12 3v2', 'M12 19v2', 'M5.64 5.64l1.42 1.42', 'M16.94 16.94l1.42 1.42', 'M3 12h2', 'M19 12h2', 'M5.64 18.36l1.42-1.42', 'M16.94 7.06l1.42-1.42', 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z']
  }
};

function createSvg(paths, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);

  for (const pathData of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
  }
  return svg;
}

function getDayGroup(createdAt) {
  const date = new Date(createdAt);
  const today = new Date();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (startOfDate.getTime() === startOfToday.getTime()) return 'Today';

  const weekAgo = new Date(startOfToday);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return startOfDate >= weekAgo ? 'Earlier this week' : 'Earlier';
}

function formatTime(createdAt) {
  const date = new Date(createdAt);
  const dayGroup = getDayGroup(createdAt);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
  if (dayGroup === 'Today') return `Today, ${time}`;
  if (dayGroup === 'Earlier this week') {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
    return `${weekday}, ${time}`;
  }
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date);
}

function categoryFor(notification) {
  if (REPORT_KINDS.has(notification.kind)) return 'reports';
  if (COMMUNITY_KINDS.has(notification.kind)) return 'community';
  return null;
}

function createNotificationCard(notification, expanded, onOpen) {
  const unread = !notification.readAt;
  const icon = ICONS[notification.kind] || ICONS.community_notice;
  const time = formatTime(notification.createdAt);
  const accessibleLabel = `${unread ? 'Unread, ' : ''}${notification.title}, ${notification.body}, ${time}`;
  const card = createElement('button', {
    cls: ['cn-notification-card', unread ? 'is-unread' : ''],
    attrs: {
      type: 'button',
      'aria-label': accessibleLabel,
      'aria-expanded': COMMUNITY_KINDS.has(notification.kind) ? String(expanded) : null
    }
  });

  const iconTile = createElement('span', { cls: ['cn-notification-icon', `is-${icon.color}`] });
  iconTile.appendChild(createSvg(icon.paths));
  const content = createElement('span', { cls: 'cn-notification-content' });
  const title = createElement('span', { cls: 'cn-notification-title', text: notification.title });
  const description = createElement('span', {
    cls: ['cn-notification-description', expanded ? 'is-expanded' : ''],
    text: notification.body
  });
  const timeEl = createElement('span', { cls: 'cn-notification-time', text: time });
  content.append(title, description, timeEl);
  card.append(iconTile, content);

  if (unread) {
    card.appendChild(createElement('span', {
      cls: 'cn-notification-unread-dot',
      attrs: { 'aria-hidden': 'true' }
    }));
  }
  card.onclick = onOpen;
  return card;
}

export class PageNotifications extends BaseElement {
  constructor() {
    super();
    this._filter = 'all';
    this._expandedIds = new Set();
  }

  connectedCallback() {
    this._unsubscribe = notificationsStore.subscribe(() => this._render());
    this._unsubscribeBeacon = subscribeIncomingPendingCount(() => this._render());
    this._alertsActive = true;
    prepareNotificationsForSession();
    this._render();
    this._loadMessagingAlerts().catch((error) => {
      console.error('Could not load Beacon alerts:', error);
      this._announce('Beacon alerts could not be refreshed.');
    });
  }

  disconnectedCallback() {
    this._alertsActive = false;
    if (this._unsubscribe) this._unsubscribe();
    if (this._unsubscribeBeacon) this._unsubscribeBeacon();
    if (this._messageAlertSubscription) this._messageAlertSubscription.unsubscribe();
    super.disconnectedCallback();
  }

  async _loadMessagingAlerts() {
    const subscription = await subscribeToMessagingAlerts((error) => {
      console.error('Beacon alerts Realtime error:', error);
      this._announce('Live Beacon alerts are unavailable. Reopen Notifications to refresh.');
    });
    if (!this._alertsActive || !this.isConnected) {
      subscription.unsubscribe();
      return;
    }
    this._messageAlertSubscription = subscription;
    await subscription.ready;
    if (this._alertsActive && this.isConnected) await refreshMessagingAlerts();
  }

  _render() {
    clearChildren(this);
    this.classList.add('cn-notifications-page');

    const notifications = getNotifications().slice().sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
    const incomingPendingCount = getIncomingPendingCount();
    const unreadCount = notifications.filter((notification) => !notification.readAt).length;
    const header = createElement('header', { cls: 'cn-notifications-header' });
    header.appendChild(createElement('h1', {
      cls: 'cn-notifications-title',
      text: 'Notifications'
    }));

    if (unreadCount > 0) {
      const markAll = createElement('button', {
        cls: 'cn-notifications-mark-all',
        attrs: { type: 'button' },
        text: 'Mark all read'
      });
      markAll.onclick = () => {
        markAllNotificationsRead();
        this._announce('All alerts marked as read');
        markAllMessagingAlertsRead().catch((error) => {
          console.error('Could not mark Beacon alerts as read:', error);
          this._announce('Beacon alerts could not be marked as read.');
        });
      };
      header.appendChild(markAll);
    }
    this.appendChild(header);

    if (notifications.length === 0 && incomingPendingCount === 0) {
      this.appendChild(createEmptyState(
        'No alerts yet',
        "You'll be notified here when one of your reports updates, or there's important news for your area.",
        null,
        'bell'
      ));
      return;
    }

    const filters = createElement('div', {
      cls: 'cn-notifications-filters',
      attrs: { role: 'group', 'aria-label': 'Filter notifications' }
    });
    const filterOptions = [
      { id: 'all', label: 'All' },
      { id: 'reports', label: 'Reports' },
      { id: 'community', label: 'Community' }
    ];
    for (const filter of filterOptions) {
      const selected = this._filter === filter.id;
      const button = createElement('button', {
        cls: ['cn-notification-filter', selected ? 'is-selected' : ''],
        attrs: {
          type: 'button',
          'aria-pressed': String(selected)
        }
      });
      button.appendChild(document.createTextNode(filter.label));
      if (filter.id === 'all' && unreadCount > 0) {
        button.appendChild(createElement('span', {
          cls: 'cn-notification-filter-count',
          text: String(unreadCount),
          attrs: { 'aria-label': `${unreadCount} unread` }
        }));
      }
      button.onclick = () => {
        this._filter = filter.id;
        document.querySelector('#cn-main-content')?.scrollTo({ top: 0 });
        this._render();
      };
      filters.appendChild(button);
    }
    this.appendChild(filters);

    const visibleNotifications = this._filter === 'all'
      ? notifications
      : notifications.filter((notification) => categoryFor(notification) === this._filter);

    if (visibleNotifications.length === 0 && incomingPendingCount === 0) {
      const category = this._filter === 'reports' ? 'reports' : 'community';
      this.appendChild(createEmptyState('Nothing here', `No ${category} alerts yet.`, null, 'bell'));
      return;
    }

    const feed = createElement('div', {
      cls: 'cn-notifications-feed',
      attrs: { 'aria-label': 'Notifications' }
    });
    if (incomingPendingCount > 0) {
      const requestLink = createElement('a', {
        cls: ['cn-notification-card', 'cn-circle-request-notification', 'is-unread'],
        attrs: {
          href: '#beacon-requests',
          'aria-label': `${incomingPendingCount} circle ${incomingPendingCount === 1 ? 'request' : 'requests'} waiting`
        }
      });
      requestLink.appendChild(createElement('span', {
        cls: 'cn-notification-content',
        text: `${incomingPendingCount} circle ${incomingPendingCount === 1 ? 'request' : 'requests'} waiting`
      }));
      requestLink.onclick = (event) => {
        event.preventDefault();
        navigate('beacon-requests');
      };
      feed.appendChild(requestLink);
    }
    let activeGroup = '';
    for (const notification of visibleNotifications) {
      const group = getDayGroup(notification.createdAt);
      if (group !== activeGroup) {
        const label = createElement('h2', {
          cls: 'cn-notification-day-label',
          text: group
        });
        feed.appendChild(label);
        activeGroup = group;
      }

      const expanded = this._expandedIds.has(notification.id);
      const card = createNotificationCard(notification, expanded, () => {
        markNotificationRead(notification.id);
        if (notification.isMessagingAlert) {
          markMessagingAlertRead(notification.id).catch((error) => {
            console.error('Could not mark Beacon alert as read:', error);
            this._announce('Beacon alert could not be marked as read.');
          });
        }
        if (COMMUNITY_KINDS.has(notification.kind)) {
          // TODO: Link community notices to their destination when those screens are designed.
          this._expandedIds.add(notification.id);
          this._render();
          return;
        }
        if (notification.reportRef) {
          navigate('report-detail', { id: notification.reportRef });
        }
      });
      feed.appendChild(card);
    }
    this.appendChild(feed);
    this.appendChild(createElement('div', {
      cls: 'cn-notifications-live-status',
      attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' }
    }));
  }

  _announce(message) {
    const status = this.querySelector('.cn-notifications-live-status');
    if (status) status.textContent = message;
  }
}

customElements.define('page-notifications', PageNotifications);
