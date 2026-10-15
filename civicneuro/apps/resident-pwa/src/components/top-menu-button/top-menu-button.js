/**
 * @file apps/resident-pwa/src/components/top-menu-button/top-menu-button.js
 * Top Menu button component matching CivicNeuro design spec.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate, parseHash } from '../../router.js';

export class CnTopMenuButton extends BaseElement {
  connectedCallback() {
    this._onHash = () => this.updateActiveState();
    window.addEventListener('hashchange', this._onHash);
    this.render();
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this._onHash);
    super.disconnectedCallback();
  }

  updateActiveState() {
    const btn = this.querySelector('.m-menubtn, .cn-top-menu-btn');
    if (!btn) return;
    const { path } = parseHash();
    if (path === 'menu') {
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.classList.remove('active');
      btn.removeAttribute('aria-current');
    }
  }

  render() {
    clearChildren(this);

    const btn = createElement('button', {
      cls: ['m-menubtn', 'cn-top-menu-btn'],
      attrs: { type: 'button', 'aria-label': 'Open menu', id: 'cn-top-menu-btn' }
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 7h16M4 12h16M4 17h16');
    svg.appendChild(path);

    const label = createElement('span', { text: 'Menu' });

    btn.appendChild(svg);
    btn.appendChild(label);

    btn.onclick = () => navigate('menu');

    this.appendChild(btn);
    this.updateActiveState();
  }
}
customElements.define('cn-top-menu-button', CnTopMenuButton);
