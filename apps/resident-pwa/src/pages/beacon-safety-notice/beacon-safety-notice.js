/**
 * @file apps/resident-pwa/src/pages/beacon-safety-notice/beacon-safety-notice.js
 * Beacon Safety Policy notice — shown before first session if needed.
 * Uses the design system classes defined in beacon-safety-notice.css.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import { navigate } from '../../router.js';

const SAFETY_POINTS = [
  {
    title: 'No Location History',
    body: 'Coordinates are transmitted live and never saved to any database or server log after your session ends.'
  },
  {
    title: 'Time-Limited Sharing',
    body: 'Every session expires automatically after your chosen duration or when you arrive at your destination.'
  },
  {
    title: 'Instant Revocation',
    body: 'You can stop sharing at any moment via the red "Stop sharing" button in the live session view.'
  },
  {
    title: 'Circle Members Only',
    body: 'Your location is visible only to the specific circle members you select when you start sharing.'
  }
];

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
    const title = createElement('h1', { cls: 'safety-title', text: 'Beacon Safety Policy' });
    this.appendChild(title);

    // Safety items
    for (let i = 0; i < SAFETY_POINTS.length; i++) {
      const pt = SAFETY_POINTS[i];
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
      text: 'I understand'
    });
    btn.onclick = () => navigate('beacon-home');
    this.appendChild(btn);
  }
}
customElements.define('page-beacon-safety-notice', PageBeaconSafetyNotice);
