/**
 * @file apps/resident-pwa/src/pages/notification-settings/notification-settings.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageNotificationSettings extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Notification Preferences' });
    const toggles = [
      'Report Status Updates via SMS',
      'Community Safety Alerts',
      'Ward Councillor Bulletins',
      'Beacon Circle Requests'
    ];

    this.appendChild(h);
    for (const t of toggles) {
      const row = createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '12px 0';
      row.style.borderBottom = '1px solid #dfe1e6';

      const label = createElement('span', { text: t, attrs: { style: 'font-size: 0.875rem;' } });
      const check = createElement('input', { attrs: { type: 'checkbox', checked: 'true' } });
      row.appendChild(label);
      row.appendChild(check);
      this.appendChild(row);
    }
  }
}
customElements.define('page-notification-settings', PageNotificationSettings);
