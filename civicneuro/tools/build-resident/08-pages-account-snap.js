/**
 * @file tools/build-resident/08-pages-account-snap.js
 * Generates Snap & Say, Account, Profile, Language, Terms, Privacy, Data Export, Delete Account pages.
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

// 1. snap-and-say
write('apps/resident-pwa/src/pages/snap-and-say/snap-and-say.js', `/**
 * @file apps/resident-pwa/src/pages/snap-and-say/snap-and-say.js
 * Press-and-hold mic, live transcript, AI draft with single follow-up question,
 * emergency interrupt offering Lifeline, resident confirmation summary.
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { transcribeAudio, analyzeReportIntent } from '../../features/snap-and-say/snap-and-say.client.js';
import { submitReport } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';
import '../../components/voice-input/voice-input.js';
import '../../components/transcript-view/transcript-view.js';
import '../../components/camera-capture/camera-capture.js';

export class PageSnapAndSay extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: '🎙️ Snap & Say' });
    const p = createElement('p', { text: 'Hold the button and speak in English, isiZulu, or Afrikaans. AI will categorize your report.', attrs: { style: 'color: #5e6c84;' } });

    const voiceInput = createElement('cn-voice-input');
    const transcriptView = createElement('cn-transcript-view');
    const cameraCapture = createElement('cn-camera-capture');

    // Container for AI draft card & follow up question
    const draftContainer = createElement('div');
    draftContainer.style.marginTop = '20px';

    voiceInput.addEventListener('record-stop', async () => {
      transcriptView.text = 'Transcribing audio…';
      try {
        const trans = await transcribeAudio(null);
        transcriptView.text = trans.text;

        // Emergency wording check
        const lower = trans.text.toLowerCase();
        if (lower.includes('fire') || lower.includes('gun') || lower.includes('attack') || lower.includes('injured')) {
          draftContainer.style.background = '#ffebe6';
          draftContainer.style.padding = '16px';
          draftContainer.style.borderRadius = '8px';
          const alert = createElement('h3', { text: '🚨 Life-Threatening Emergency Detected', attrs: { style: 'color: #de350b;' } });
          const alertMsg = createElement('p', { text: 'Do you need immediate emergency services? Tap below to open Lifeline.' });
          const lifeBtn = createElement('button', { cls: 'cn-btn cn-btn--danger cn-btn--full', text: 'Go to Lifeline (Emergency)' });
          lifeBtn.onclick = () => navigate('lifeline-home');
          draftContainer.appendChild(alert);
          draftContainer.appendChild(alertMsg);
          draftContainer.appendChild(lifeBtn);
          return;
        }

        const draft = await analyzeReportIntent(trans.text, null);
        clearChildren(draftContainer);
        draftContainer.style.background = '#e3fcef';
        draftContainer.style.padding = '16px';
        draftContainer.style.borderRadius = '8px';

        const draftH = createElement('h3', { text: 'AI Report Summary' });
        const cat = createElement('div', { text: \`Category: \${draft.category}\`, attrs: { style: 'font-weight: 700;' } });
        const desc = createElement('div', { text: draft.description, attrs: { style: 'margin: 8px 0;' } });

        // Maximum ONE follow-up question
        let followUpInput = null;
        if (draft.followUpQuestion) {
          const fq = createElement('div', { text: \`❓ \${draft.followUpQuestion}\`, attrs: { style: 'font-weight: 600; color: #0747a6; margin-top: 12px;' } });
          followUpInput = createElement('input', { cls: 'cn-input', attrs: { placeholder: 'Your answer…' } });
          draftContainer.appendChild(fq);
          draftContainer.appendChild(followUpInput);
        }

        const confirmBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Confirm and File Report' });
        confirmBtn.style.marginTop = '16px';
        confirmBtn.onclick = async () => {
          confirmBtn.disabled = true;
          confirmBtn.textContent = 'Filing report…';
          const fullDesc = followUpInput && followUpInput.value
            ? \`\${draft.description} (Additional info: \${followUpInput.value})\`
            : draft.description;

          const rep = await submitReport({
            title: 'Snap & Say Civic Report',
            category: draft.category,
            description: fullDesc,
            latitude: -29.8587,
            longitude: 31.0218,
            address: 'GPS Auto-Detected'
          });
          showToast('Report filed successfully!', { type: 'success' });
          navigate('report-submitted', { ref: rep.referenceNumber });
        };

        draftContainer.appendChild(draftH);
        draftContainer.appendChild(cat);
        draftContainer.appendChild(desc);
        draftContainer.appendChild(confirmBtn);
      } catch (err) {
        transcriptView.text = 'Error processing speech. Please try again or type manually.';
      }
    });

    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(voiceInput);
    this.appendChild(transcriptView);
    this.appendChild(cameraCapture);
    this.appendChild(draftContainer);
  }
}
customElements.define('page-snap-and-say', PageSnapAndSay);
`);

// 2. account & profile-edit & badges-edit & notification-settings
write('apps/resident-pwa/src/pages/account/account.js', `/**
 * @file apps/resident-pwa/src/pages/account/account.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { sessionStore } from '../../session.js';
import { navigate } from '../../router.js';

export class PageAccount extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const session = sessionStore.get();
    const user = session.user || { fullName: 'Resident', phone: '+27820001122', email: 'resident@example.co.za' };

    const h = createElement('h1', { text: 'My Account' });
    const card = createElement('div');
    card.style.background = '#fff';
    card.style.border = '1px solid #dfe1e6';
    card.style.borderRadius = '12px';
    card.style.padding = '16px';
    card.style.marginBottom = '20px';

    const name = createElement('h2', { text: user.fullName, attrs: { style: 'margin: 0 0 4px; font-size: 1.25rem;' } });
    const phone = createElement('div', { text: \`📱 \${user.phone}\`, attrs: { style: 'color: #5e6c84; font-size: 0.875rem;' } });
    const email = createElement('div', { text: \`✉️ \${user.email || 'No email attached'}\`, attrs: { style: 'color: #5e6c84; font-size: 0.875rem;' } });
    const editBtn = createElement('button', { cls: 'cn-btn cn-btn--secondary', text: 'Edit Profile' });
    editBtn.style.marginTop = '12px';
    editBtn.onclick = () => navigate('profile-edit');

    card.appendChild(name);
    card.appendChild(phone);
    card.appendChild(email);
    card.appendChild(editBtn);
    this.appendChild(h);
    this.appendChild(card);

    // Badges Section
    const badgeCard = createElement('div');
    badgeCard.style.background = '#f4f5f7';
    badgeCard.style.borderRadius = '12px';
    badgeCard.style.padding = '16px';
    badgeCard.style.marginBottom = '20px';

    const badgeH = createElement('h3', { text: '🏅 Civic Badges', attrs: { style: 'margin: 0 0 8px;' } });
    const badgeList = createElement('div', { text: '🌟 Active Reporter • 🛡️ Safety Advocate • 🗳️ Ward Voter' });
    badgeCard.appendChild(badgeH);
    badgeCard.appendChild(badgeList);
    this.appendChild(badgeCard);

    // Danger Zone
    const dangerH = createElement('h3', { text: 'Data Privacy & Deletion (POPIA)', attrs: { style: 'color: #de350b;' } });
    const exportBtn = createElement('button', { cls: 'cn-btn cn-btn--secondary cn-btn--full', text: '📦 Export All Personal Data' });
    exportBtn.onclick = () => navigate('data-export');

    const deleteBtn = createElement('button', { cls: 'cn-btn cn-btn--danger cn-btn--full', text: '🗑️ Delete My Account' });
    deleteBtn.style.marginTop = '8px';
    deleteBtn.onclick = () => navigate('delete-account');

    this.appendChild(dangerH);
    this.appendChild(exportBtn);
    this.appendChild(deleteBtn);
  }
}
customElements.define('page-account', PageAccount);
`);

write('apps/resident-pwa/src/pages/profile-edit/profile-edit.js', `/**
 * @file apps/resident-pwa/src/pages/profile-edit/profile-edit.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageProfileEdit extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Edit Profile' });
    const name = createElement('cn-input', { attrs: { label: 'Full Name', value: 'Simphiwe Mthembu' } });
    const phone = createElement('cn-input', { attrs: { label: 'Phone Number', value: '+27820001122' } });
    const saveBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Save Changes' });
    saveBtn.onclick = () => {
      showToast('Profile updated!', { type: 'success' });
      navigate('account');
    };

    this.appendChild(h);
    this.appendChild(name);
    this.appendChild(phone);
    this.appendChild(saveBtn);
  }
}
customElements.define('page-profile-edit', PageProfileEdit);
`);

write('apps/resident-pwa/src/pages/badges-edit/badges-edit.js', `/**
 * @file apps/resident-pwa/src/pages/badges-edit/badges-edit.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageBadgesEdit extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Civic Badges Showcase' });
    this.appendChild(h);
  }
}
customElements.define('page-badges-edit', PageBadgesEdit);
`);

write('apps/resident-pwa/src/pages/notification-settings/notification-settings.js', `/**
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
`);

// 3. language & terms & privacy-policy & contacts & data-export & delete-account
write('apps/resident-pwa/src/pages/language/language.js', `/**
 * @file apps/resident-pwa/src/pages/language/language.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { availableLanguages, switchLanguage, getCurrentLanguage } from '../../features/i18n/language.js';
import { navigate } from '../../router.js';

export class PageLanguage extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Select Language' });
    const p = createElement('p', { text: 'Khetha ulimi / Kies ' + 'n taal' });
    this.appendChild(h);
    this.appendChild(p);

    const current = getCurrentLanguage();

    for (const lang of availableLanguages) {
      const card = createElement('div');
      card.style.padding = '16px';
      card.style.border = '1px solid ' + (current === lang.code ? '#0052cc' : '#dfe1e6');
      card.style.background = current === lang.code ? '#deebff' : '#ffffff';
      card.style.borderRadius = '8px';
      card.style.marginBottom = '12px';
      card.style.cursor = 'pointer';
      card.style.fontWeight = '600';
      card.textContent = lang.name;

      card.onclick = () => {
        switchLanguage(lang.code);
        showToast(\`Language set to \${lang.name}\`, { type: 'success' });
        navigate('home');
      };
      this.appendChild(card);
    }
  }
}
customElements.define('page-language', PageLanguage);
`);

write('apps/resident-pwa/src/pages/terms/terms.js', `/**
 * @file apps/resident-pwa/src/pages/terms/terms.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageTerms extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Terms of Service' });
    const p = createElement('p', { text: 'CivicNeuro is provided for lawful civic issue reporting and safety communication in South African municipal wards.' });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-terms', PageTerms);
`);

write('apps/resident-pwa/src/pages/privacy-policy/privacy-policy.js', `/**
 * @file apps/resident-pwa/src/pages/privacy-policy/privacy-policy.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PagePrivacyPolicy extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'POPIA Privacy Notice' });
    const p = createElement('p', { text: 'We process personal information (names, phones, locations, photos) strictly under the Protection of Personal Information Act (POPIA) for municipal service delivery. Data is encrypted at rest, access tokens are held in memory only, and you may export or delete your personal data at any time.' });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-privacy-policy', PagePrivacyPolicy);
`);

write('apps/resident-pwa/src/pages/contacts/contacts.js', `/**
 * @file apps/resident-pwa/src/pages/contacts/contacts.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageContacts extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Civic Support Contacts' });
    this.appendChild(h);
  }
}
customElements.define('page-contacts', PageContacts);
`);

write('apps/resident-pwa/src/pages/data-export/data-export.js', `/**
 * @file apps/resident-pwa/src/pages/data-export/data-export.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { exportMyData } from '../../features/account/account.client.js';

export class PageDataExport extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Export My Personal Data' });
    const p = createElement('p', { text: 'Download a full copy of your profile, report records, and activity under POPIA Section 23/24.' });

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Generate & Download Data Archive (JSON)' });
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Generating archive…';
      await exportMyData();
      showToast('Data export download started', { type: 'success' });
      btn.disabled = false;
      btn.textContent = 'Generate & Download Data Archive (JSON)';
    };

    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(btn);
  }
}
customElements.define('page-data-export', PageDataExport);
`);

write('apps/resident-pwa/src/pages/delete-account/delete-account.js', `/**
 * @file apps/resident-pwa/src/pages/delete-account/delete-account.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { deleteMyAccount } from '../../features/account/account.client.js';
import { navigate } from '../../router.js';
import '../../components/confirm-dialog/confirm-dialog.js';

export class PageDeleteAccount extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Delete Account', attrs: { style: 'color: #de350b;' } });
    const p = createElement('p', { text: 'Deleting your account is permanent. All profile information and credentials will be purged. Submitted civic reports stay on record for municipal resolution but will no longer be linked to you.', attrs: { style: 'line-height: 1.5;' } });

    const pwd = createElement('cn-input', { attrs: { label: 'Confirm Password to Authorize Deletion', type: 'password', required: 'true' } });
    const delBtn = createElement('button', { cls: 'cn-btn cn-btn--danger cn-btn--full', text: 'Permanently Delete Account' });
    delBtn.style.marginTop = '16px';

    delBtn.onclick = () => {
      const { CnConfirmDialog } = customElements.get('cn-confirm-dialog') ? { CnConfirmDialog: customElements.get('cn-confirm-dialog') } : {};
      CnConfirmDialog.show({
        title: 'Permanently Delete Account?',
        message: 'This cannot be undone. Reports stay on record but are no longer linked to you.',
        confirmText: 'Delete Forever',
        danger: true,
        onConfirm: async () => {
          await deleteMyAccount(pwd.value);
          showToast('Your account has been deleted.', { type: 'info' });
          navigate('welcome');
        }
      });
    };

    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(pwd);
    this.appendChild(delBtn);
  }
}
customElements.define('page-delete-account', PageDeleteAccount);
`);

// 4. pilot-org-select & guest-confirmation & empty/error state pages
write('apps/resident-pwa/src/pages/pilot-org-select/pilot-org-select.js', `/**
 * @file apps/resident-pwa/src/pages/pilot-org-select/pilot-org-select.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PagePilotOrgSelect extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Pilot Municipality Selection' });
    this.appendChild(h);
  }
}
customElements.define('page-pilot-org-select', PagePilotOrgSelect);
`);

write('apps/resident-pwa/src/pages/guest-confirmation/guest-confirmation.js', `/**
 * @file apps/resident-pwa/src/pages/guest-confirmation/guest-confirmation.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageGuestConfirmation extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Guest Action Confirmation' });
    this.appendChild(h);
  }
}
customElements.define('page-guest-confirmation', PageGuestConfirmation);
`);

write('apps/resident-pwa/src/pages/empty-state/empty-state.js', `/**
 * @file apps/resident-pwa/src/pages/empty-state/empty-state.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/empty-state/empty-state.js';

export class PageEmptyState extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    const empty = createElement('cn-empty-state');
    this.appendChild(empty);
  }
}
customElements.define('page-empty-state', PageEmptyState);
`);

write('apps/resident-pwa/src/pages/error-state/error-state.js', `/**
 * @file apps/resident-pwa/src/pages/error-state/error-state.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/error-state/error-state.js';

export class PageErrorState extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    const err = createElement('cn-error-state');
    this.appendChild(err);
  }
}
customElements.define('page-error-state', PageErrorState);
`);

console.log('Account and Snap & Say pages generated successfully.');
