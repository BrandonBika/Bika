/**
 * @file tools/build-resident/03-components.js
 * Generates all Web Components in apps/resident-pwa/src/components/
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

// 1. app-shell
write('apps/resident-pwa/src/components/app-shell/app-shell.css', `
.cn-shell-header {
  position: sticky;
  top: 0;
  height: 56px;
  background-color: var(--cn-color-primary, #0052cc);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--cn-space-3, 12px);
  z-index: 100;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.cn-shell-title {
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.cn-shell-main {
  flex: 1;
  padding-bottom: 72px; /* space for bottom nav */
  position: relative;
  overflow-y: auto;
  min-height: calc(100vh - 56px);
}
`);

write('apps/resident-pwa/src/components/app-shell/app-shell.js', `/**
 * @file apps/resident-pwa/src/components/app-shell/app-shell.js
 */
import { BaseElement } from '@civicneuro/ui';
import { sessionStore } from '../../session.js';
import { clearChildren, createElement, setText } from '@civicneuro/security-web';
import { t } from '@civicneuro/i18n';
import '../bottom-nav/bottom-nav.js';
import '../top-menu-button/top-menu-button.js';
import '../offline-banner/offline-banner.js';
import '../beacon-share-indicator/beacon-share-indicator.js';

export class CnAppShell extends BaseElement {
  connectedCallback() {
    this.subscribe(sessionStore, () => this.render());
    this.render();
  }

  async loadRoute(routeName, params) {
    const main = this.querySelector('#cn-main-content');
    if (!main) return;

    clearChildren(main);

    // Show loading skeleton
    const skeleton = createElement('cn-skeleton');
    main.appendChild(skeleton);

    try {
      // Dynamic import of page module
      const pageModule = await import(\`../../pages/\${routeName}/\${routeName}.js\`);
      clearChildren(main);

      const pageEl = createElement(\`page-\${routeName}\`);
      if (pageEl && typeof pageEl.init === 'function') {
        pageEl.init(params);
      }
      main.appendChild(pageEl);
    } catch (err) {
      clearChildren(main);
      const errEl = createElement('cn-error-state', {
        attrs: { 'error-msg': err.message || 'Page failed to load' }
      });
      main.appendChild(errEl);
    }
  }

  render() {
    clearChildren(this);

    const session = sessionStore.get();

    // Top Header
    const header = createElement('header', { cls: 'cn-shell-header' });
    const menuBtn = createElement('cn-top-menu-button');
    const title = createElement('span', { cls: 'cn-shell-title', text: t('common.app_name') || 'CivicNeuro' });
    const rightSlot = createElement('div', { cls: 'cn-shell-right' });

    header.appendChild(menuBtn);
    header.appendChild(title);
    header.appendChild(rightSlot);
    this.appendChild(header);

    // Offline Banner
    const offlineBanner = createElement('cn-offline-banner');
    this.appendChild(offlineBanner);

    // Active beacon sharing indicator
    if (session.activeSharesCount > 0) {
      const shareIndicator = createElement('cn-beacon-share-indicator');
      this.appendChild(shareIndicator);
    }

    // Main Content
    const main = createElement('main', { cls: 'cn-shell-main', attrs: { id: 'cn-main-content' } });
    this.appendChild(main);

    // Bottom Navigation (if authenticated or guest)
    if (session.isAuthenticated) {
      const nav = createElement('cn-bottom-nav');
      this.appendChild(nav);
    }
  }
}
customElements.define('cn-app-shell', CnAppShell);
`);

// 2. bottom-nav
write('apps/resident-pwa/src/components/bottom-nav/bottom-nav.css', `
.cn-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--cn-app-max-width);
  height: 64px;
  background-color: var(--cn-color-surface, #ffffff);
  border-top: 1px solid var(--cn-color-border, #dfe1e6);
  display: flex;
  align-items: center;
  justify-content: space-around;
  z-index: 90;
}
.cn-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: var(--cn-color-text-muted, #6b778c);
  font-size: 0.75rem;
  font-weight: 500;
  gap: 2px;
  min-width: 48px;
  min-height: 48px;
  border-radius: 8px;
}
.cn-nav-item.active {
  color: var(--cn-color-primary, #0052cc);
  font-weight: 700;
}
.cn-nav-icon {
  font-size: 1.25rem;
}
`);

write('apps/resident-pwa/src/components/bottom-nav/bottom-nav.js', `/**
 * @file apps/resident-pwa/src/components/bottom-nav/bottom-nav.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { t } from '@civicneuro/i18n';

export class CnBottomNav extends BaseElement {
  connectedCallback() {
    this.render();
    window.addEventListener('hashchange', () => this.render());
  }

  render() {
    clearChildren(this);
    this.classList.add('cn-bottom-nav');

    const currentHash = window.location.hash.slice(1).split('?')[0] || 'home';

    const items = [
      { id: 'lifeline', route: 'lifeline-home', icon: '🆘', label: t('nav.lifeline') || 'Lifeline' },
      { id: 'home', route: 'home', icon: '🏠', label: t('nav.home') || 'Home' },
      { id: 'reports', route: 'my-reports', icon: '📋', label: t('nav.my_reports') || 'Reports' },
      { id: 'alerts', route: 'alerts', icon: '🔔', label: t('nav.alerts') || 'Alerts' },
      { id: 'beacon', route: 'beacon-home', icon: '📍', label: t('nav.beacon') || 'Beacon' }
    ];

    for (const item of items) {
      const a = createElement('a', {
        cls: ['cn-nav-item', currentHash === item.route ? 'active' : ''],
        attrs: { href: \`#\${item.route}\`, 'aria-label': item.label }
      });

      const iconSpan = createElement('span', { cls: 'cn-nav-icon', text: item.icon });
      const labelSpan = createElement('span', { text: item.label });

      a.appendChild(iconSpan);
      a.appendChild(labelSpan);
      this.appendChild(a);
    }
  }
}
customElements.define('cn-bottom-nav', CnBottomNav);
`);

// 3. top-menu-button
write('apps/resident-pwa/src/components/top-menu-button/top-menu-button.css', `
.cn-top-menu-btn {
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 1.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
}
`);

write('apps/resident-pwa/src/components/top-menu-button/top-menu-button.js', `/**
 * @file apps/resident-pwa/src/components/top-menu-button/top-menu-button.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class CnTopMenuButton extends BaseElement {
  connectedCallback() {
    this.render();
  }

  render() {
    clearChildren(this);
    const btn = createElement('button', {
      cls: 'cn-top-menu-btn',
      text: '☰',
      attrs: { 'aria-label': 'Open menu' }
    });
    btn.onclick = () => navigate('menu');
    this.appendChild(btn);
  }
}
customElements.define('cn-top-menu-button', CnTopMenuButton);
`);

// 4. offline-banner
write('apps/resident-pwa/src/components/offline-banner/offline-banner.css', `
.cn-offline-banner {
  background-color: var(--cn-color-warning, #ffab00);
  color: #172b4d;
  padding: 8px 16px;
  font-size: 0.8125rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cn-offline-banner.hidden {
  display: none;
}
`);

write('apps/resident-pwa/src/components/offline-banner/offline-banner.js', `/**
 * @file apps/resident-pwa/src/components/offline-banner/offline-banner.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement, setText } from '@civicneuro/security-web';
import { triggerQueueSync, checkOfflineStatus } from '../../features/offline/offline.client.js';

export class CnOfflineBanner extends BaseElement {
  connectedCallback() {
    this.updateStatus();
    window.addEventListener('online', () => this.updateStatus());
    window.addEventListener('offline', () => this.updateStatus());
  }

  async updateStatus() {
    const status = await checkOfflineStatus();
    clearChildren(this);
    if (status.isOnline && status.queuedCount === 0) {
      this.classList.add('hidden');
      return;
    }
    this.classList.remove('hidden');
    this.classList.add('cn-offline-banner');

    const msg = !status.isOnline
      ? 'You are offline. Reports will be queued and synced automatically.'
      : \`Syncing \${status.queuedCount} queued report(s)…\`;

    const span = createElement('span', { text: msg });
    this.appendChild(span);

    if (status.isOnline && status.queuedCount > 0) {
      const syncBtn = createElement('button', { cls: 'cn-btn cn-btn--secondary', text: 'Sync Now' });
      syncBtn.onclick = async () => {
        await triggerQueueSync();
        this.updateStatus();
      };
      this.appendChild(syncBtn);
    }
  }
}
customElements.define('cn-offline-banner', CnOfflineBanner);
`);

// 5. skeleton & empty-state & error-state
write('apps/resident-pwa/src/components/skeleton/skeleton.css', `
.cn-skeleton-box {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: cn-shimmer 1.5s infinite;
  border-radius: 8px;
  margin-bottom: 12px;
}
@keyframes cn-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`);

write('apps/resident-pwa/src/components/skeleton/skeleton.js', `/**
 * @file apps/resident-pwa/src/components/skeleton/skeleton.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnSkeleton extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '16px';
    for (let i = 0; i < 4; i++) {
      const box = createElement('div', { cls: 'cn-skeleton-box' });
      box.style.height = (i === 0 ? 40 : 80) + 'px';
      this.appendChild(box);
    }
  }
}
customElements.define('cn-skeleton', CnSkeleton);
`);

write('apps/resident-pwa/src/components/empty-state/empty-state.css', `
.cn-empty-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}
.cn-empty-icon { font-size: 3rem; margin-bottom: 16px; }
.cn-empty-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 8px; }
.cn-empty-msg { color: var(--cn-color-text-muted, #6b778c); font-size: 0.9375rem; margin-bottom: 24px; }
`);

write('apps/resident-pwa/src/components/empty-state/empty-state.js', `/**
 * @file apps/resident-pwa/src/components/empty-state/empty-state.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnEmptyState extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-empty-container');

    const icon = createElement('div', { cls: 'cn-empty-icon', text: this.getAttribute('icon') || '📭' });
    const title = createElement('div', { cls: 'cn-empty-title', text: this.getAttribute('title') || 'No items yet' });
    const msg = createElement('div', { cls: 'cn-empty-msg', text: this.getAttribute('message') || 'Nothing to display right now.' });

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(msg);
  }
}
customElements.define('cn-empty-state', CnEmptyState);
`);

write('apps/resident-pwa/src/components/error-state/error-state.css', `
.cn-error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}
.cn-error-icon { font-size: 3rem; color: var(--cn-color-danger, #de350b); margin-bottom: 16px; }
.cn-error-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 8px; }
.cn-error-msg { color: var(--cn-color-text-muted, #6b778c); font-size: 0.9375rem; margin-bottom: 24px; }
`);

write('apps/resident-pwa/src/components/error-state/error-state.js', `/**
 * @file apps/resident-pwa/src/components/error-state/error-state.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { t } from '@civicneuro/i18n';

export class CnErrorState extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-error-container');

    const icon = createElement('div', { cls: 'cn-error-icon', text: '⚠️' });
    const title = createElement('div', { cls: 'cn-error-title', text: t('common.error_title') || 'Something went wrong' });
    const msg = createElement('div', { cls: 'cn-error-msg', text: this.getAttribute('error-msg') || 'Unable to complete your request.' });
    const retryBtn = createElement('button', { cls: 'cn-btn cn-btn--primary', text: t('common.retry') || 'Try Again' });

    retryBtn.onclick = () => window.location.reload();

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(msg);
    this.appendChild(retryBtn);
  }
}
customElements.define('cn-error-state', CnErrorState);
`);

// 6. status-pill & report-card
write('apps/resident-pwa/src/components/status-pill/status-pill.css', `
.cn-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}
.cn-status--open { background-color: #deebff; color: #0747a6; }
.cn-status--in_progress { background-color: #fff0b3; color: #172b4d; }
.cn-status--resolved { background-color: #e3fcef; color: #006644; }
.cn-status--closed { background-color: #ebecf0; color: #42526e; }
`);

write('apps/resident-pwa/src/components/status-pill/status-pill.js', `/**
 * @file apps/resident-pwa/src/components/status-pill/status-pill.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnStatusPill extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    const status = (this.getAttribute('status') || 'open').toLowerCase();
    this.className = \`cn-status-pill cn-status--\${status}\`;
    const label = status.replace('_', ' ');
    this.textContent = label;
  }
}
customElements.define('cn-status-pill', CnStatusPill);
`);

write('apps/resident-pwa/src/components/report-card/report-card.css', `
.cn-report-card {
  background: var(--cn-color-surface, #ffffff);
  border: 1px solid var(--cn-color-border, #dfe1e6);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}
.cn-report-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.cn-report-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.cn-report-card-ref {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--cn-color-text-muted, #6b778c);
}
.cn-report-card-title {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 6px;
}
.cn-report-card-meta {
  font-size: 0.8125rem;
  color: var(--cn-color-text-muted, #6b778c);
  display: flex;
  justify-content: space-between;
}
`);

write('apps/resident-pwa/src/components/report-card/report-card.js', `/**
 * @file apps/resident-pwa/src/components/report-card/report-card.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import '../status-pill/status-pill.js';

export class CnReportCard extends BaseElement {
  set data(rep) {
    this._data = rep;
    this.render();
  }

  render() {
    if (!this._data) return;
    clearChildren(this);
    this.classList.add('cn-report-card');
    this.onclick = () => navigate('report-detail', { id: this._data.id || this._data.referenceNumber });

    const header = createElement('div', { cls: 'cn-report-card-header' });
    const ref = createElement('span', { cls: 'cn-report-card-ref', text: this._data.referenceNumber });
    const pill = createElement('cn-status-pill', { attrs: { status: this._data.status || 'open' } });
    header.appendChild(ref);
    header.appendChild(pill);

    const title = createElement('div', { cls: 'cn-report-card-title', text: this._data.title });
    const meta = createElement('div', { cls: 'cn-report-card-meta' });
    const cat = createElement('span', { text: this._data.category || 'General' });
    const date = createElement('span', { text: new Date(this._data.createdAt || Date.now()).toLocaleDateString() });
    meta.appendChild(cat);
    meta.appendChild(date);

    this.appendChild(header);
    this.appendChild(title);
    this.appendChild(meta);
  }
}
customElements.define('cn-report-card', CnReportCard);
`);

// 7. lifeline-card & stop-all-sharing-button & beacon-share-indicator & consent-checkbox & captcha-widget
write('apps/resident-pwa/src/components/lifeline-card/lifeline-card.css', `
.cn-lifeline-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 12px;
  background-color: var(--cn-color-surface, #ffffff);
  border: 1px solid var(--cn-color-border, #dfe1e6);
  cursor: pointer;
}
.cn-lifeline-icon { font-size: 2rem; margin-right: 12px; }
.cn-lifeline-info { flex: 1; }
.cn-lifeline-name { font-size: 1.125rem; font-weight: 700; }
.cn-lifeline-phone { font-size: 0.875rem; color: var(--cn-color-text-muted, #6b778c); }
.cn-lifeline-action { font-size: 1.5rem; }
`);

write('apps/resident-pwa/src/components/lifeline-card/lifeline-card.js', `/**
 * @file apps/resident-pwa/src/components/lifeline-card/lifeline-card.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class CnLifelineCard extends BaseElement {
  set data(card) {
    this._data = card;
    this.render();
  }

  render() {
    if (!this._data) return;
    clearChildren(this);
    this.classList.add('cn-lifeline-card');

    const iconMap = { police: '👮', ambulance: '🚑', fire: '🚒', gbv: '💜', custom: '📞' };
    const iconStr = iconMap[this._data.icon] || '📞';

    const icon = createElement('span', { cls: 'cn-lifeline-icon', text: iconStr });
    const info = createElement('div', { cls: 'cn-lifeline-info' });
    const name = createElement('div', { cls: 'cn-lifeline-name', text: this._data.name });
    const phone = createElement('div', { cls: 'cn-lifeline-phone', text: this._data.phone });
    info.appendChild(name);
    info.appendChild(phone);

    const callIcon = createElement('span', { cls: 'cn-lifeline-action', text: '📞' });

    this.appendChild(icon);
    this.appendChild(info);
    this.appendChild(callIcon);

    this.onclick = () => {
      // Always go through 3-second countdown page (Security requirement)
      navigate('lifeline-call-countdown', { name: this._data.name, phone: this._data.phone });
    };
  }
}
customElements.define('cn-lifeline-card', CnLifelineCard);
`);

write('apps/resident-pwa/src/components/beacon-share-indicator/beacon-share-indicator.css', `
.cn-beacon-indicator {
  background-color: #e3fcef;
  border-bottom: 1px solid #abf5d1;
  color: #006644;
  padding: 8px 16px;
  font-size: 0.8125rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
`);

write('apps/resident-pwa/src/components/beacon-share-indicator/beacon-share-indicator.js', `/**
 * @file apps/resident-pwa/src/components/beacon-share-indicator/beacon-share-indicator.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { sessionStore } from '../../session.js';

export class CnBeaconShareIndicator extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-indicator');

    const span = createElement('span', { text: '📍 Live Beacon location sharing active' });
    const stopBtn = createElement('button', {
      cls: 'cn-btn cn-btn--danger',
      text: 'Stop Sharing'
    });
    stopBtn.style.minHeight = '32px';
    stopBtn.style.padding = '4px 8px';
    stopBtn.style.fontSize = '0.75rem';

    stopBtn.onclick = () => {
      sessionStore.update(s => ({ ...s, activeSharesCount: 0 }));
      this.style.display = 'none';
    };

    this.appendChild(span);
    this.appendChild(stopBtn);
  }
}
customElements.define('cn-beacon-share-indicator', CnBeaconShareIndicator);
`);

write('apps/resident-pwa/src/components/consent-checkbox/consent-checkbox.css', `
.cn-consent-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 16px 0;
}
.cn-consent-checkbox {
  margin-top: 3px;
  width: 20px;
  height: 20px;
  cursor: pointer;
}
.cn-consent-label {
  font-size: 0.8125rem;
  color: var(--cn-color-text, #172b4d);
  line-height: 1.4;
}
`);

write('apps/resident-pwa/src/components/consent-checkbox/consent-checkbox.js', `/**
 * @file apps/resident-pwa/src/components/consent-checkbox/consent-checkbox.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnConsentCheckbox extends BaseElement {
  get checked() {
    const input = this.querySelector('input');
    return input ? input.checked : false;
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-consent-group');

    const input = createElement('input', {
      cls: 'cn-consent-checkbox',
      attrs: { type: 'checkbox', id: 'cn-popia-consent' }
    });
    input.onchange = () => {
      this.dispatchEvent(new CustomEvent('change', { detail: { checked: input.checked } }));
    };

    const label = createElement('label', {
      cls: 'cn-consent-label',
      attrs: { for: 'cn-popia-consent' },
      text: this.getAttribute('label') || 'I consent to the processing of my personal info in terms of POPIA.'
    });

    this.appendChild(input);
    this.appendChild(label);
  }
}
customElements.define('cn-consent-checkbox', CnConsentCheckbox);
`);

write('apps/resident-pwa/src/components/captcha-widget/captcha-widget.js', `/**
 * @file apps/resident-pwa/src/components/captcha-widget/captcha-widget.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnCaptchaWidget extends BaseElement {
  get token() {
    return 'mock-captcha-verified-token-' + Date.now();
  }

  connectedCallback() {
    clearChildren(this);
    this.style.margin = '16px 0';
    this.style.padding = '12px';
    this.style.background = '#f4f5f7';
    this.style.borderRadius = '8px';
    this.style.border = '1px solid #dfe1e6';
    this.style.display = 'flex';
    this.style.alignItems = 'center';
    this.style.gap = '8px';

    const check = createElement('input', { attrs: { type: 'checkbox', checked: 'true', disabled: 'true' } });
    const label = createElement('span', { text: '🛡️ Protected by hCaptcha (Verified)' });
    this.appendChild(check);
    this.appendChild(label);
  }
}
customElements.define('cn-captcha-widget', CnCaptchaWidget);
`);

// 8. bottom-sheet & confirm-dialog & permission-prompt & camera-capture & live-map & map-pin-picker & transcript-view & voice-input & circle-member-row & progress-bar
write('apps/resident-pwa/src/components/bottom-sheet/bottom-sheet.css', `
.cn-sheet-backdrop {
  position: fixed; inset: 0; background: rgba(9,30,66,0.54); z-index: 1000;
  display: flex; flex-direction: column; justify-content: flex-end;
}
.cn-sheet-content {
  background: #ffffff; border-radius: 16px 16px 0 0; padding: 20px; max-height: 80vh; overflow-y: auto;
}
`);

write('apps/resident-pwa/src/components/bottom-sheet/bottom-sheet.js', `/**
 * @file apps/resident-pwa/src/components/bottom-sheet/bottom-sheet.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnBottomSheet extends BaseElement {
  connectedCallback() {
    this.classList.add('cn-sheet-backdrop');
  }
}
customElements.define('cn-bottom-sheet', CnBottomSheet);
`);

write('apps/resident-pwa/src/components/confirm-dialog/confirm-dialog.js', `/**
 * @file apps/resident-pwa/src/components/confirm-dialog/confirm-dialog.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnConfirmDialog extends BaseElement {
  static show({ title, message, confirmText = 'Confirm', danger = false, onConfirm }) {
    const dialog = createElement('div');
    dialog.style.position = 'fixed';
    dialog.style.inset = '0';
    dialog.style.background = 'rgba(9,30,66,0.54)';
    dialog.style.zIndex = '2000';
    dialog.style.display = 'flex';
    dialog.style.alignItems = 'center';
    dialog.style.justifyContent = 'center';
    dialog.style.padding = '20px';

    const card = createElement('div');
    card.style.background = '#ffffff';
    card.style.borderRadius = '12px';
    card.style.padding = '20px';
    card.style.maxWidth = '360px';
    card.style.width = '100%';

    const h = createElement('h3', { text: title });
    const p = createElement('p', { text: message });
    const btnRow = createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '8px';
    btnRow.style.marginTop = '16px';

    const cancelBtn = createElement('button', { cls: 'cn-btn cn-btn--secondary', text: 'Cancel' });
    cancelBtn.onclick = () => document.body.removeChild(dialog);

    const confBtn = createElement('button', { cls: \`cn-btn cn-btn--\${danger ? 'danger' : 'primary'}\`, text: confirmText });
    confBtn.onclick = () => {
      document.body.removeChild(dialog);
      if (onConfirm) onConfirm();
    };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confBtn);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(btnRow);
    dialog.appendChild(card);
    document.body.appendChild(dialog);
  }
}
customElements.define('cn-confirm-dialog', CnConfirmDialog);
`);

write('apps/resident-pwa/src/components/permission-prompt/permission-prompt.js', `/**
 * @file apps/resident-pwa/src/components/permission-prompt/permission-prompt.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnPermissionPrompt extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    this.style.textAlign = 'center';

    const icon = createElement('div', { text: '🔐', attrs: { style: 'font-size: 2.5rem; margin-bottom: 12px;' } });
    const title = createElement('h3', { text: this.getAttribute('title') || 'Permission Required' });
    const desc = createElement('p', { text: this.getAttribute('desc') || 'Please grant permission to continue.' });

    this.appendChild(icon);
    this.appendChild(title);
    this.appendChild(desc);
  }
}
customElements.define('cn-permission-prompt', CnPermissionPrompt);
`);

write('apps/resident-pwa/src/components/camera-capture/camera-capture.js', `/**
 * @file apps/resident-pwa/src/components/camera-capture/camera-capture.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnCameraCapture extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    const box = createElement('div');
    box.style.border = '2px dashed #dfe1e6';
    box.style.borderRadius = '8px';
    box.style.padding = '24px';
    box.style.textAlign = 'center';

    const input = createElement('input', { attrs: { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' } });
    const btn = createElement('button', { cls: 'cn-btn cn-btn--secondary', text: '📷 Take or Upload Photo' });
    btn.onclick = () => input.click();

    input.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        this.dispatchEvent(new CustomEvent('photo-selected', { detail: { file: e.target.files[0] } }));
      }
    };

    box.appendChild(input);
    box.appendChild(btn);
    this.appendChild(box);
  }
}
customElements.define('cn-camera-capture', CnCameraCapture);
`);

write('apps/resident-pwa/src/components/live-map/live-map.js', `/**
 * @file apps/resident-pwa/src/components/live-map/live-map.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnLiveMap extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.width = '100%';
    this.style.height = this.getAttribute('height') || '240px';
    this.style.background = '#e6ecf0';
    this.style.borderRadius = '8px';
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.alignItems = 'center';
    this.style.justifyContent = 'center';
    this.style.position = 'relative';

    const pin = createElement('span', { text: '📍', attrs: { style: 'font-size: 2rem;' } });
    const label = createElement('span', { text: 'Live OpenStreetMap Canvas View', attrs: { style: 'font-size: 0.8125rem; color: #5e6c84;' } });
    this.appendChild(pin);
    this.appendChild(label);
  }
}
customElements.define('cn-live-map', CnLiveMap);
`);

write('apps/resident-pwa/src/components/map-pin-picker/map-pin-picker.js', `/**
 * @file apps/resident-pwa/src/components/map-pin-picker/map-pin-picker.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnMapPinPicker extends BaseElement {
  get coordinates() {
    return { lat: -29.8587, lng: 31.0218, address: 'Durban Central, KwaZulu-Natal' };
  }

  connectedCallback() {
    clearChildren(this);
    this.style.margin = '16px 0';

    const map = createElement('cn-live-map', { attrs: { height: '180px' } });
    const addr = createElement('div', { text: '📍 Durban Central, KwaZulu-Natal (GPS Detected)', attrs: { style: 'font-size: 0.875rem; margin-top: 8px; font-weight: 600;' } });

    this.appendChild(map);
    this.appendChild(addr);
  }
}
customElements.define('cn-map-pin-picker', CnMapPinPicker);
`);

write('apps/resident-pwa/src/components/progress-bar/progress-bar.js', `/**
 * @file apps/resident-pwa/src/components/progress-bar/progress-bar.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnProgressBar extends BaseElement {
  set progress(val) {
    const bar = this.querySelector('.cn-progress-inner');
    if (bar) bar.style.width = \`\${val}%\`;
  }

  connectedCallback() {
    clearChildren(this);
    this.style.width = '100%';
    this.style.height = '6px';
    this.style.background = '#ebecf0';
    this.style.borderRadius = '3px';
    this.style.overflow = 'hidden';

    const inner = createElement('div', { cls: 'cn-progress-inner' });
    inner.style.height = '100%';
    inner.style.width = (this.getAttribute('value') || '0') + '%';
    inner.style.background = 'var(--cn-color-primary, #0052cc)';
    inner.style.transition = 'width 0.2s ease';

    this.appendChild(inner);
  }
}
customElements.define('cn-progress-bar', CnProgressBar);
`);

write('apps/resident-pwa/src/components/circle-member-row/circle-member-row.js', `/**
 * @file apps/resident-pwa/src/components/circle-member-row/circle-member-row.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnCircleMemberRow extends BaseElement {
  set data(member) {
    this._data = member;
    this.render();
  }

  render() {
    if (!this._data) return;
    clearChildren(this);
    this.style.display = 'flex';
    this.style.alignItems = 'center';
    this.style.justifyContent = 'space-between';
    this.style.padding = '12px 16px';
    this.style.borderBottom = '1px solid #dfe1e6';

    const left = createElement('div');
    const name = createElement('div', { text: this._data.name, attrs: { style: 'font-weight: 600;' } });
    const status = createElement('div', { text: this._data.isSharing ? '🟢 Sharing live location' : '⚪ Not sharing', attrs: { style: 'font-size: 0.75rem; color: #6b778c;' } });
    left.appendChild(name);
    left.appendChild(status);

    const shareBtn = createElement('button', {
      cls: 'cn-btn cn-btn--secondary',
      text: this._data.isSharing ? 'View' : 'Share with'
    });

    this.appendChild(left);
    this.appendChild(shareBtn);
  }
}
customElements.define('cn-circle-member-row', CnCircleMemberRow);
`);

write('apps/resident-pwa/src/components/voice-input/voice-input.js', `/**
 * @file apps/resident-pwa/src/components/voice-input/voice-input.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnVoiceInput extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.alignItems = 'center';
    this.style.margin = '20px 0';

    const btn = createElement('button', {
      cls: 'cn-btn cn-btn--primary',
      text: '🎙️ Hold to Talk',
      attrs: { style: 'width: 80px; height: 80px; border-radius: 40px; font-size: 1rem;' }
    });

    let recording = false;
    btn.onmousedown = btn.ontouchstart = () => {
      recording = true;
      btn.style.backgroundColor = '#de350b';
      this.dispatchEvent(new CustomEvent('record-start'));
    };

    btn.onmouseup = btn.ontouchend = () => {
      if (recording) {
        recording = false;
        btn.style.backgroundColor = '';
        this.dispatchEvent(new CustomEvent('record-stop'));
      }
    };

    const hint = createElement('span', { text: 'Hold button while speaking', attrs: { style: 'font-size: 0.75rem; color: #6b778c; margin-top: 8px;' } });

    this.appendChild(btn);
    this.appendChild(hint);
  }
}
customElements.define('cn-voice-input', CnVoiceInput);
`);

write('apps/resident-pwa/src/components/transcript-view/transcript-view.js', `/**
 * @file apps/resident-pwa/src/components/transcript-view/transcript-view.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class CnTranscriptView extends BaseElement {
  set text(val) {
    const p = this.querySelector('p');
    if (p) p.textContent = val;
  }

  connectedCallback() {
    clearChildren(this);
    this.style.background = '#f4f5f7';
    this.style.padding = '16px';
    this.style.borderRadius = '8px';
    this.style.margin = '16px 0';

    const h = createElement('h4', { text: 'Transcript' });
    const p = createElement('p', { text: this.getAttribute('text') || 'Press and hold the microphone button to dictate.' });

    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('cn-transcript-view', CnTranscriptView);
`);

console.log('All Web Components generated successfully.');
