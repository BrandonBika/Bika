/**
 * @file apps/resident-pwa/src/components/bottom-nav/bottom-nav.js
 * Bottom navigation component matching CivicNeuro design spec.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate, parseHash } from '../../router.js';
import {
  getUnreadNotificationCount,
  notificationsStore
} from '../../features/notifications/notifications.store.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createIcon(paths, circles = []) {
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

  for (const c of circles) {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(c.cx));
    circle.setAttribute('cy', String(c.cy));
    circle.setAttribute('r', String(c.r));
    svg.appendChild(circle);
  }

  return svg;
}

const REPORT_ROUTES = [
  'my-reports',
  'report-detail',
  'report-thread',
  'report-satisfaction',
  'report-reopen-escalate',
  'report-duplicate-check',
  'offline-queued'
];

const BEACON_ROUTES = [
  'beacon-home',
  'beacon-add-to-circle',
  'beacon-chat',
  'beacon-find-contacts',
  'beacon-requests',
  'beacon-safety-notice'
];

export class CnBottomNav extends BaseElement {
  connectedCallback() {
    this._onHash = () => this.render();
    window.addEventListener('hashchange', this._onHash);
    this._unsubscribeNotifications = notificationsStore.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this._onHash);
    if (this._unsubscribeNotifications) this._unsubscribeNotifications();
    super.disconnectedCallback();
  }

  render() {
    clearChildren(this);
    this.className = 'cn-bottom-nav';

    const { path: currentPath, params: currentParams } = parseHash();

    const items = [
      {
        id: 'lifeline',
        route: 'lifeline-home',
        label: 'Lifeline',
        paths: [
          'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 3a2 2 0 0 1-.4 2.1L8 10.3a16 16 0 0 0 6 6l1.5-1.5a2 2 0 0 1 2-.5c1 .3 2 .5 3 .6a2 2 0 0 1 1.5 2Z',
          'M14.05 2a9 9 0 0 1 8 7.94',
          'M14.05 6A5 5 0 0 1 18 10'
        ],
        circles: []
      },
      {
        id: 'home',
        route: 'home',
        label: 'Home',
        paths: ['M3 11 12 3l9 8', 'M5 10v10h14V10'],
        circles: []
      },
      {
        id: 'track',
        route: 'my-reports',
        label: 'Reports',
        paths: [
          'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
          'M14 2v6h6'
        ],
        circles: [],
        isActive: REPORT_ROUTES.includes(currentPath)
      },
      {
        id: 'notifications',
        route: 'notifications',
        label: 'Alerts',
        paths: ['M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9'],
        circles: []
      },
      {
        id: 'beacon',
        route: 'beacon-home',
        label: 'Beacon',
        paths: ['M12 22s7-7.6 7-12.5A7 7 0 0 0 5 9.5C5 14.4 12 22 12 22Z'],
        circles: [{ cx: 12, cy: 9.5, r: 2.3 }],
        isActive: BEACON_ROUTES.includes(currentPath) || (currentPath === 'contacts-permission' && currentParams?.source === 'beacon')
      }
    ];

    for (const item of items) {
      const active = item.isActive !== undefined
        ? item.isActive
        : (currentPath === item.route || (item.id === 'notifications' && currentPath === 'alerts'));
      const a = createElement('a', {
        cls: ['nav-item', 'cn-nav-item', active ? 'active' : ''],
        attrs: {
          href: `#${item.route}`,
          'aria-label': item.id === 'notifications' && getUnreadNotificationCount() > 0
            ? `${item.label}, ${getUnreadNotificationCount()} unread`
            : item.label,
          'aria-current': active ? 'page' : null,
          id: `cn-nav-${item.id}`
        }
      });

      const iconSpan = createElement('span', { cls: 'cn-nav-icon' });
      iconSpan.appendChild(createIcon(item.paths, item.circles));
      if (item.id === 'notifications' && getUnreadNotificationCount() > 0) {
        iconSpan.appendChild(createElement('span', {
          cls: 'cn-nav-badge',
          attrs: { 'aria-hidden': 'true' },
          text: String(getUnreadNotificationCount())
        }));
      }
      const labelSpan = createElement('span', { cls: 'cn-nav-label', text: item.label });

      a.appendChild(iconSpan);
      a.appendChild(labelSpan);

      if (item.id === 'notifications') {
        a.onclick = (e) => {
          e.preventDefault();
          if (currentPath === 'notifications' || currentPath === 'alerts') {
            const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'auto'
              : 'smooth';
            document.querySelector('#cn-main-content')?.scrollTo({ top: 0, behavior });
          } else {
            navigate('notifications');
          }
        };
      }

      // Handle re-tapping Reports
      if (item.id === 'reports') {
        a.onclick = (e) => {
          e.preventDefault();
          if (currentPath === 'my-reports') {
            const main = document.querySelector('#cn-main-content');
            if (main) {
              main.scrollTo({ top: 0, behavior: 'smooth' });
            }
          } else {
            navigate('my-reports');
          }
        };
      }

      // Handle re-tapping Beacon
      if (item.id === 'beacon') {
        a.onclick = (e) => {
          e.preventDefault();
          if (currentPath === 'beacon-home') {
            window.dispatchEvent(new CustomEvent('beacon:reset-view'));
          } else {
            navigate('beacon-home');
          }
        };
      }

      this.appendChild(a);
    }
  }
}
customElements.define('cn-bottom-nav', CnBottomNav);
