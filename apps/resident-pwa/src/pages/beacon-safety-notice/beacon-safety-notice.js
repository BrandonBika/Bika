/**
 * @file apps/resident-pwa/src/pages/beacon-safety-notice/beacon-safety-notice.js
 * Beacon Safety Policy notice — shown before first session if needed.
 * Uses the design system classes defined in beacon-safety-notice.css.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import { config } from '../../config.js';
import { navigate } from '../../router.js';

const LIVE_LOCATION_ROUTES = new Set([
  'beacon-start-confirm',
  'beacon-share-session',
  'beacon-draw-path'
]);

export class PageBeaconSafetyNotice extends BaseElement {
  init(params) {
    this._params = params || {};
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-beacon-safety-page');
    this.render();
  }

  render() {
    clearChildren(this);

    // Icon
    const iconWrap = createElement('div', { cls: 'safety-icon', attrs: { 'aria-hidden': 'true' } });
    iconWrap.appendChild(BeaconIcons.pin(24, 'var(--beacon, #1C8C99)'));
    this.appendChild(iconWrap);

    // Title
    const title = createElement('h1', { cls: 'safety-title', text: 'Beacon sharing is coming soon' });
    this.appendChild(title);

    const liveLocationNotice = config.beaconEnabled
      && LIVE_LOCATION_ROUTES.has(this._params.requestedRoute);
    const safetyPoints = [{
      title: 'What this means today',
      body: liveLocationNotice
        ? 'Circle requests and chat are available. Live location sharing is coming soon and is not delivered to others.'
        : 'Circle requests, chat, and live location are not delivered to other people or stored on a server. Beacon controls are temporarily unavailable.'
    }];

    // Safety items
    for (let i = 0; i < safetyPoints.length; i++) {
      const pt = safetyPoints[i];
      const item = createElement('div', { cls: 'safety-item' });

      const num = createElement('div', {
        cls: 'safety-item-num',
        attrs: { 'aria-hidden': 'true' },
        text: String(i + 1)
      });

      const textWrap = createElement('div', { cls: 'safety-item-text' });
      const strong = createElement('strong', { text: pt.title });
      const body = document.createTextNode(pt.body);
      textWrap.append(strong, body);

      item.append(num, textWrap);
      this.appendChild(item);
    }

    // CTA
    const btn = createElement('button', {
      cls: 'safety-continue-btn',
      attrs: { type: 'button', id: 'safety-continue-btn' },
      text: 'Return to Home'
    });
    btn.onclick = () => navigate('home');
    this.appendChild(btn);
  }
}
customElements.define('page-beacon-safety-notice', PageBeaconSafetyNotice);
