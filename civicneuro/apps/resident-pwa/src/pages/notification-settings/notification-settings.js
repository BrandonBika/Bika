/**
 * @file apps/resident-pwa/src/pages/notification-settings/notification-settings.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getResidentProfile, updateResidentPreferences } from '@civicneuro/supabase-client';
import { sessionStore } from '../../session.js';
import '../../components/back-button/back-button.js';

export class PageNotificationSettings extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'account' } }));
    this.style.padding = '20px';

    const session = sessionStore.get();
    const ownerId = session.user?.id;
    if (!session.isAuthenticated || session.isGuest || !ownerId) {
      showToast('Sign in with a resident account to manage notification preferences.', { type: 'error' });
      return;
    }

    let profile;
    try {
      profile = await getResidentProfile(ownerId);
    } catch (error) {
      showToast(error.message || 'Your notification preferences could not be loaded.', { type: 'error' });
      return;
    }

    const toggles = [
      { column: 'report_status_updates_sms', label: 'Report Status Updates via SMS' },
      { column: 'community_safety_alerts', label: 'Community Safety Alerts' },
      { column: 'ward_councillor_bulletins', label: 'Ward Councillor Bulletins' },
      { column: 'beacon_circle_requests', label: 'Beacon Circle Requests' }
    ];

    const h = createElement('h1', { text: 'Notification Preferences' });
    const form = createElement('form');
    const fields = new Map();
    for (const { column, label } of toggles) {
      const row = createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '12px 0';
      row.style.borderBottom = '1px solid #dfe1e6';

      const caption = createElement('span', { text: label, attrs: { style: 'font-size: 0.875rem;' } });
      const check = createElement('input', {
        attrs: {
          type: 'checkbox',
          name: column,
          checked: profile[column] === true ? 'true' : null
        }
      });
      fields.set(column, check);
      row.appendChild(caption);
      row.appendChild(check);
      form.appendChild(row);
    }

    const saveButton = createElement('button', {
      text: 'Save preferences',
      attrs: { type: 'submit' }
    });
    form.appendChild(saveButton);
    this.append(h, form);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      saveButton.disabled = true;
      const changes = {};
      for (const [column, input] of fields) {
        if (input.checked !== (profile[column] === true)) changes[column] = input.checked;
      }
      if (Object.keys(changes).length === 0) {
        showToast('Notification preferences are up to date.', { type: 'success' });
        saveButton.disabled = false;
        return;
      }

      try {
        await updateResidentPreferences(ownerId, changes);
        Object.assign(profile, changes);
        showToast('Notification preferences saved.', { type: 'success' });
      } catch (error) {
        for (const [column, input] of fields) input.checked = profile[column] === true;
        showToast(error.message || 'Your notification preferences could not be updated.', { type: 'error' });
      } finally {
        saveButton.disabled = false;
      }
    });
  }
}
customElements.define('page-notification-settings', PageNotificationSettings);
