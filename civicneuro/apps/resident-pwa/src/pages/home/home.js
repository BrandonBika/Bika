/**
 * @file apps/resident-pwa/src/pages/home/home.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { sessionStore } from '../../session.js';
import {
  getUnreadNotificationCount,
  notificationsStore
} from '../../features/notifications/notifications.store.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createIcon(paths) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  for (const pathData of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
  }

  return svg;
}

export class PageHome extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-home-page');

    const session = sessionStore.get();
    const name = session.user?.fullName?.split(' ')[0] || 'Resident';

    const welcome = createElement('header', { cls: 'cn-home-welcome' });
    welcome.appendChild(createElement('p', { cls: 'cn-home-greeting', text: 'Good afternoon' }));
    welcome.appendChild(createElement('h1', { cls: 'cn-home-name', text: name }));
    this.appendChild(welcome);

    const grid = createElement('div', { cls: 'cn-home-quick-grid' });
    const snap = createElement('button', {
      cls: 'cn-home-quick cn-home-quick--snap',
      attrs: { type: 'button', 'aria-label': 'Open Snap and Say report' }
    });
    const snapIcons = createElement('div', { cls: 'cn-home-quick-icons' });
    const micIcon = createElement('span', { cls: 'cn-home-icon cn-home-icon--main' });
    micIcon.appendChild(createIcon([
      'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z',
      'M19 10v2a7 7 0 0 1-14 0v-2M12 19v4'
    ]));
    const cameraIcon = createElement('span', { cls: 'cn-home-icon' });
    cameraIcon.appendChild(createIcon([
      'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z',
      'M12 13a4 4 0 1 0 0 .01'
    ]));
    snapIcons.append(micIcon, cameraIcon);
    snap.append(snapIcons);
    snap.append(
      createElement('span', { cls: 'cn-home-quick-title', text: 'Snap & Say' }),
      createElement('span', { cls: 'cn-home-quick-sub', text: 'AI voice + photo — say it, snap it' })
    );
    snap.onclick = () => navigate('snap-and-say');

    const report = createElement('button', {
      cls: 'cn-home-quick cn-home-quick--report',
      attrs: { type: 'button', 'aria-label': 'Open report form' }
    });
    const reportIcon = createElement('span', { cls: 'cn-home-icon cn-home-icon--report' });
    reportIcon.appendChild(createIcon([
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z',
      'M14 2v6h6',
      'M12 11v6M9 14h6'
    ]));
    report.append(reportIcon, createElement('span', { cls: 'cn-home-quick-title', text: 'Report an issue' }));
    report.appendChild(createElement('span', { cls: 'cn-home-quick-sub', text: 'Fill in a form · about 2 min' }));
    report.onclick = () => navigate('report-new');
    grid.append(snap, report);
    this.appendChild(grid);

    const area = createElement('section', { cls: 'cn-home-area' });
    const areaHeader = createElement('header', { cls: 'cn-home-area-header' });
    const areaTitleGroup = createElement('div');
    const areaEyebrow = createElement('div', { cls: 'cn-home-area-eyebrow' });
    areaEyebrow.appendChild(createIcon(['M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z']));
    areaEyebrow.appendChild(createElement('span', { text: 'Your area' }));
    areaTitleGroup.append(areaEyebrow, createElement('h2', { cls: 'cn-home-area-title', text: "What's happening around you" }));
    const seeAll = createElement('button', { cls: 'cn-home-see-all', text: 'See all ›', attrs: { type: 'button' } });
    seeAll.onclick = () => navigate('your-area');
    areaHeader.append(areaTitleGroup, seeAll);
    area.appendChild(areaHeader);

    const pulseScroll = createElement('div', { cls: 'cn-home-pulse-scroll' });
    const poll = createElement('button', { cls: 'cn-home-pulse-card cn-home-pulse-card--poll', attrs: { type: 'button' } });
    poll.appendChild(createElement('span', { cls: 'cn-home-pulse-label', text: 'Quick poll' }));
    poll.appendChild(createElement('span', { cls: 'cn-home-pulse-copy', text: 'Should this park get more lighting?' }));
    poll.appendChild(createElement('span', { cls: 'cn-home-poll-options', text: 'Yes     No' }));
    poll.onclick = () => navigate('poll-detail');

    const pulse = createElement('button', { cls: 'cn-home-pulse-card cn-home-pulse-card--stat', attrs: { type: 'button' } });
    pulse.appendChild(createElement('span', { cls: 'cn-home-pulse-label', text: 'Community pulse' }));
    pulse.appendChild(createElement('span', { cls: 'cn-home-pulse-copy', text: '72% say waste collection is improving' }));
    pulse.appendChild(createElement('span', { cls: 'cn-home-pulse-meta', text: 'Based on 340 responses' }));
    pulse.onclick = () => navigate('community-pulse');

    const trending = createElement('button', { cls: 'cn-home-pulse-card cn-home-pulse-card--trend', attrs: { type: 'button' } });
    trending.appendChild(createElement('span', { cls: 'cn-home-pulse-label', text: 'Trending issue' }));
    trending.appendChild(createElement('span', { cls: 'cn-home-pulse-copy', text: 'Streetlights — #1 reported this week' }));
    trending.appendChild(createElement('span', { cls: 'cn-home-pulse-meta', text: 'Tap to view or report' }));
    trending.onclick = () => navigate('trending-issues');
    pulseScroll.append(poll, pulse, trending);
    area.appendChild(pulseScroll);
    this.appendChild(area);

    const tiles = createElement('div', { cls: 'cn-home-tiles' });
    const news = createElement('button', { cls: 'cn-home-tile', attrs: { type: 'button' } });
    const newsIcon = createElement('span', { cls: 'cn-home-tile-icon cn-home-tile-icon--news' });
    newsIcon.appendChild(createIcon(['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M8 12h8M8 16h8']));
    news.append(newsIcon, createElement('span', { cls: 'cn-home-tile-label', text: 'News' }), createElement('span', { cls: 'cn-home-tile-meta', text: '4 new' }));
    news.onclick = () => navigate('news');

    const surveys = createElement('button', { cls: 'cn-home-tile', attrs: { type: 'button' } });
    const surveyIcon = createElement('span', { cls: 'cn-home-tile-icon cn-home-tile-icon--survey' });
    surveyIcon.appendChild(createIcon(['M9 11l3 3L22 4', 'M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11']));
    surveys.append(surveyIcon, createElement('span', { cls: 'cn-home-tile-label', text: 'Surveys' }), createElement('span', { cls: 'cn-home-tile-meta', text: '1 open' }));
    surveys.onclick = () => navigate('survey');

    const notifications = createElement('button', {
      cls: 'cn-home-tile',
      attrs: { type: 'button', 'aria-label': 'Open notifications' }
    });
    const notificationIcon = createElement('span', { cls: 'cn-home-tile-icon cn-home-tile-icon--notifications' });
    notificationIcon.appendChild(createIcon(['M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M10 21h4']));
    const notificationMeta = createElement('span', { cls: 'cn-home-tile-meta' });
    notifications.append(
      notificationIcon,
      createElement('span', { cls: 'cn-home-tile-label', text: 'Notifications' }),
      notificationMeta
    );
    notifications.onclick = () => navigate('notifications');

    tiles.append(news, surveys, notifications);
    this.appendChild(tiles);
    this._notificationMeta = notificationMeta;
    this._updateNotificationCount();
    this._unsubscribeNotifications = notificationsStore.subscribe(() => this._updateNotificationCount());
  }

  _updateNotificationCount() {
    if (!this._notificationMeta) return;
    const unreadCount = getUnreadNotificationCount();
    this._notificationMeta.textContent = unreadCount > 0
      ? `${unreadCount} unread`
      : 'All caught up';
  }

  disconnectedCallback() {
    if (this._unsubscribeNotifications) this._unsubscribeNotifications();
    super.disconnectedCallback();
  }
}
customElements.define('page-home', PageHome);
