/**
 * @file apps/resident-pwa/src/components/app-shell/app-shell.js
 */
import { BaseElement } from '@civicneuro/ui';
import { sessionStore } from '../../session.js';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../bottom-nav/bottom-nav.js';
import '../top-menu-button/top-menu-button.js';
import '../offline-banner/offline-banner.js';
import '../error-state/error-state.js';
import { waitForRouteStylesheet } from './route-stylesheet.js';

export class CnAppShell extends BaseElement {
  _routeLoadId = 0;

  connectedCallback() {
    this.subscribe(sessionStore, () => this.render());
    this.render();
  }

  async loadRoute(routeName, params) {
    const routeLoadId = ++this._routeLoadId;
    const entryRoutes = [
      'welcome', 'sign-in', 'register', 'verify-email', 'forgot-password',
      'reset-password', 'session-expired', 'guest-report', 'guest-confirmation', 'track-report'
    ];
    const isGuestConfirmation = routeName === 'report-submitted' && params?.isGuest === 'true';
    this.classList.toggle('cn-app-shell--entry', entryRoutes.includes(routeName) || isGuestConfirmation);
    this.classList.toggle('cn-app-shell--welcome', routeName === 'welcome');
    this.classList.toggle('cn-app-shell--notifications', routeName === 'notifications');

    const fullScreenBeaconRoutes = [
      'beacon-draw-path',
      'beacon-start-confirm',
      'beacon-share-session',
      'beacon-chat'
    ];
    this.classList.toggle('cn-app-shell--fullscreen-beacon', fullScreenBeaconRoutes.includes(routeName));
    this.classList.toggle('cn-app-shell--beacon-home', routeName === 'beacon-home');

    let routeStylesheet = document.getElementById('cn-route-stylesheet');
    if (!routeStylesheet) {
      routeStylesheet = createElement('link', {
        attrs: { id: 'cn-route-stylesheet', rel: 'stylesheet' }
      });
      document.head.appendChild(routeStylesheet);
    }
    const stylesheetLoaded = waitForRouteStylesheet(routeStylesheet);
    routeStylesheet.href = new URL(`../../pages/${routeName}/${routeName}.css`, import.meta.url).href;

    const main = this.querySelector('#cn-main-content');
    if (!main) return;

    clearChildren(main);

    // Show loading skeleton
    const skeleton = createElement('cn-skeleton');
    main.appendChild(skeleton);

    try {
      // Dynamic import of page module
      await import(`../../pages/${routeName}/${routeName}.js`);
      const stylesheetResult = await stylesheetLoaded;
      if (routeLoadId !== this._routeLoadId) return;
      if (stylesheetResult !== 'load') {
        console.warn(`The ${routeName} stylesheet ${stylesheetResult === 'error' ? 'failed to load' : 'timed out'}.`);
      }
      clearChildren(main);

      const pageEl = createElement(`page-${routeName}`);
      pageEl.classList.add('cn-route-page');
      if (pageEl && typeof pageEl.init === 'function') {
        pageEl.init(params);
      }
      main.appendChild(pageEl);
    } catch (err) {
      if (routeLoadId !== this._routeLoadId) return;
      console.error(`Could not load the ${routeName} page.`, err);
      clearChildren(main);
      const errEl = createElement('cn-error-state', {
        attrs: {
          title: 'Page failed to load',
          'error-msg': 'This page could not be displayed. Please refresh and try again.'
        }
      });
      main.appendChild(errEl);
    }
  }

  render() {
    clearChildren(this);

    const session = sessionStore.get();

    // 1. Status bar notch area (22px)
    const notchRow = createElement('div', { cls: ['phone-notch', 'cn-shell-notch'] });
    const pillNotch = createElement('div', { cls: 'pill-notch' });
    notchRow.appendChild(pillNotch);
    this.appendChild(notchRow);

    // 2. Top Bar (height 32px, Menu button)
    const header = createElement('header', { cls: ['m-topbar', 'cn-shell-header'] });
    const menuBtn = createElement('cn-top-menu-button');
    header.appendChild(menuBtn);
    this.appendChild(header);

    // 3. Offline Banner
    const offlineBanner = createElement('cn-offline-banner');
    this.appendChild(offlineBanner);

    // 4. Main Content
    const main = createElement('main', { cls: ['phone-content', 'cn-shell-main'], attrs: { id: 'cn-main-content' } });
    this.appendChild(main);

    // 5. Bottom Navigation
    if (session.isAuthenticated) {
      const nav = createElement('cn-bottom-nav');
      this.appendChild(nav);
    }
  }
}
customElements.define('cn-app-shell', CnAppShell);
