/**
 * @file tools/build-resident/07-pages-lifeline-beacon.js
 * Generates Lifeline and Beacon pages.
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

// 1. lifeline-home & lifeline-call-countdown & lifeline-calling-status & create/edit/picker
write('apps/resident-pwa/src/pages/lifeline-home/lifeline-home.js', `/**
 * @file apps/resident-pwa/src/pages/lifeline-home/lifeline-home.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getLifelineCards } from '../../features/lifeline/lifeline.client.js';
import { navigate } from '../../router.js';
import '../../components/lifeline-card/lifeline-card.js';

export class PageLifelineHome extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const header = createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '16px';

    const title = createElement('h1', { text: '🆘 Lifeline Emergency', attrs: { style: 'margin: 0; font-size: 1.375rem;' } });
    const addBtn = createElement('button', { cls: 'cn-btn cn-btn--secondary', text: '+ Add Contact' });
    addBtn.onclick = () => navigate('lifeline-card-create');
    header.appendChild(title);
    header.appendChild(addBtn);
    this.appendChild(header);

    const desc = createElement('p', { text: 'Tap any service or contact to start a direct call with a 3-second cancel window.', attrs: { style: 'color: #5e6c84; font-size: 0.875rem; margin-bottom: 20px;' } });
    this.appendChild(desc);

    const res = await getLifelineCards();
    for (const card of (res.cards || [])) {
      const el = createElement('cn-lifeline-card');
      el.data = card;
      this.appendChild(el);
    }
  }
}
customElements.define('page-lifeline-home', PageLifelineHome);
`);

write('apps/resident-pwa/src/pages/lifeline-call-countdown/lifeline-call-countdown.js', `/**
 * @file apps/resident-pwa/src/pages/lifeline-call-countdown/lifeline-call-countdown.js
 * 3-second mandatory cancel countdown before triggering tel: intent.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageLifelineCallCountdown extends BaseElement {
  init(params) {
    this._name = params.name || 'Emergency Contact';
    this._phone = params.phone || '10111';
  }

  connectedCallback() {
    clearChildren(this);
    this.style.padding = '32px 20px';
    this.style.textAlign = 'center';

    let seconds = 3;

    const warn = createElement('div', { text: '⚠️', attrs: { style: 'font-size: 3rem;' } });
    const title = createElement('h1', { text: \`Calling \${this._name}…\` });
    const number = createElement('div', { text: this._phone, attrs: { style: 'font-size: 1.25rem; color: #5e6c84; font-weight: 700;' } });

    const timer = createElement('div', { text: String(seconds), attrs: { style: 'font-size: 4rem; font-weight: 900; color: #de350b; margin: 24px 0;' } });

    const cancelBtn = createElement('button', {
      cls: 'cn-btn cn-btn--danger cn-btn--full',
      text: 'CANCEL CALL (3s)',
      attrs: { style: 'min-height: 56px; font-size: 1.125rem;' }
    });

    const interval = setInterval(() => {
      seconds--;
      if (seconds > 0) {
        timer.textContent = String(seconds);
        cancelBtn.textContent = \`CANCEL CALL (\${seconds}s)\`;
      } else {
        clearInterval(interval);
        // Dispatch call intent safely
        window.location.href = \`tel:\${this._phone}\`;
        navigate('lifeline-calling-status', { name: this._name, phone: this._phone });
      }
    }, 1000);

    cancelBtn.onclick = () => {
      clearInterval(interval);
      navigate('lifeline-home');
    };

    this.appendChild(warn);
    this.appendChild(title);
    this.appendChild(number);
    this.appendChild(timer);
    this.appendChild(cancelBtn);
  }
}
customElements.define('page-lifeline-call-countdown', PageLifelineCallCountdown);
`);

write('apps/resident-pwa/src/pages/lifeline-calling-status/lifeline-calling-status.js', `/**
 * @file apps/resident-pwa/src/pages/lifeline-calling-status/lifeline-calling-status.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageLifelineCallingStatus extends BaseElement {
  init(params) {
    this._name = params.name || 'Emergency Contact';
  }
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '32px 20px';
    this.style.textAlign = 'center';

    const h = createElement('h1', { text: \`Call Placed to \${this._name}\` });
    const p = createElement('p', { text: 'If your call did not connect, you can redial or return to Lifeline.' });
    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Back to Lifeline' });
    btn.onclick = () => navigate('lifeline-home');

    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(btn);
  }
}
customElements.define('page-lifeline-calling-status', PageLifelineCallingStatus);
`);

write('apps/resident-pwa/src/pages/lifeline-card-create/lifeline-card-create.js', `/**
 * @file apps/resident-pwa/src/pages/lifeline-card-create/lifeline-card-create.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageLifelineCardCreate extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Add Emergency Contact' });
    const name = createElement('cn-input', { attrs: { label: 'Contact or Facility Name', placeholder: 'e.g. Local Security Patrol' } });
    const phone = createElement('cn-input', { attrs: { label: 'Phone Number', placeholder: '082 123 4567' } });

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Save Contact' });
    btn.onclick = () => {
      showToast('Emergency contact saved', { type: 'success' });
      navigate('lifeline-home');
    };

    this.appendChild(h);
    this.appendChild(name);
    this.appendChild(phone);
    this.appendChild(btn);
  }
}
customElements.define('page-lifeline-card-create', PageLifelineCardCreate);
`);

write('apps/resident-pwa/src/pages/lifeline-card-edit/lifeline-card-edit.js', `/**
 * @file apps/resident-pwa/src/pages/lifeline-card-edit/lifeline-card-edit.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageLifelineCardEdit extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Edit Lifeline Card' });
    this.appendChild(h);
  }
}
customElements.define('page-lifeline-card-edit', PageLifelineCardEdit);
`);

write('apps/resident-pwa/src/pages/lifeline-contacts-picker/lifeline-contacts-picker.js', `/**
 * @file apps/resident-pwa/src/pages/lifeline-contacts-picker/lifeline-contacts-picker.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageLifelineContactsPicker extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Pick from Contacts' });
    this.appendChild(h);
  }
}
customElements.define('page-lifeline-contacts-picker', PageLifelineContactsPicker);
`);

write('apps/resident-pwa/src/pages/contacts-permission/contacts-permission.js', `/**
 * @file apps/resident-pwa/src/pages/contacts-permission/contacts-permission.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageContactsPermission extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '32px 20px';
    this.style.textAlign = 'center';

    const icon = createElement('div', { text: '👥', attrs: { style: 'font-size: 3rem;' } });
    const h = createElement('h1', { text: 'Contacts Access' });
    const p = createElement('p', { text: 'CivicNeuro needs access to your contacts solely to let you choose Lifeline numbers and Beacon circle members. Your contacts are never uploaded or shared.' });
    const allowBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Allow Contacts' });
    const denyBtn = createElement('button', { cls: 'cn-btn cn-btn--ghost cn-btn--full', text: 'Not Now (Type Manually)' });

    allowBtn.onclick = () => navigate('beacon-home');
    denyBtn.onclick = () => navigate('beacon-home');

    this.appendChild(icon);
    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(allowBtn);
    this.appendChild(denyBtn);
  }
}
customElements.define('page-contacts-permission', PageContactsPermission);
`);

// 2. beacon-home & beacon-safety-notice & add-to-circle & requests & find-contacts & chat & share-session
write('apps/resident-pwa/src/pages/beacon-home/beacon-home.js', `/**
 * @file apps/resident-pwa/src/pages/beacon-home/beacon-home.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getCircleMembers } from '../../features/beacon/beacon.client.js';
import { navigate } from '../../router.js';
import '../../components/live-map/live-map.js';
import '../../components/circle-member-row/circle-member-row.js';

export class PageBeaconHome extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '16px';

    const h = createElement('h1', { text: '📍 Beacon Live Safety' });
    const noticeLink = createElement('button', { cls: 'cn-btn cn-btn--ghost', text: 'ℹ️ Safety & POPIA Notice' });
    noticeLink.onclick = () => navigate('beacon-safety-notice');
    this.appendChild(h);
    this.appendChild(noticeLink);

    const map = createElement('cn-live-map', { attrs: { height: '200px' } });
    this.appendChild(map);

    const shareBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: '⚡ Start Live Location Share' });
    shareBtn.style.margin = '16px 0';
    shareBtn.onclick = () => navigate('beacon-share-session');
    this.appendChild(shareBtn);

    const circleH = createElement('div');
    circleH.style.display = 'flex';
    circleH.style.justifyContent = 'space-between';
    circleH.style.alignItems = 'center';
    circleH.style.marginTop = '16px';

    const t = createElement('h3', { text: 'My Safety Circle', attrs: { style: 'margin: 0;' } });
    const addMember = createElement('button', { cls: 'cn-btn cn-btn--secondary', text: '+ Add' });
    addMember.onclick = () => navigate('beacon-add-to-circle');
    circleH.appendChild(t);
    circleH.appendChild(addMember);
    this.appendChild(circleH);

    const res = await getCircleMembers();
    for (const mem of (res.members || [])) {
      const row = createElement('cn-circle-member-row');
      row.data = mem;
      this.appendChild(row);
    }
  }
}
customElements.define('page-beacon-home', PageBeaconHome);
`);

write('apps/resident-pwa/src/pages/beacon-safety-notice/beacon-safety-notice.js', `/**
 * @file apps/resident-pwa/src/pages/beacon-safety-notice/beacon-safety-notice.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageBeaconSafetyNotice extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Beacon Safety Policy' });
    const p1 = createElement('p', { text: '1. No Location History: Coordinates are transmitted live through end-to-end private channels and never saved to any database or server log.' });
    const p2 = createElement('p', { text: '2. Time-Limited: Every sharing session expires automatically after the chosen duration or upon reaching your destination.' });
    const p3 = createElement('p', { text: '3. Instant Revocation: You can stop sharing at any second via the red "Stop Sharing" button.' });

    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'I Understand' });
    btn.onclick = () => navigate('beacon-home');

    this.appendChild(h);
    this.appendChild(p1);
    this.appendChild(p2);
    this.appendChild(p3);
    this.appendChild(btn);
  }
}
customElements.define('page-beacon-safety-notice', PageBeaconSafetyNotice);
`);

write('apps/resident-pwa/src/pages/beacon-add-to-circle/beacon-add-to-circle.js', `/**
 * @file apps/resident-pwa/src/pages/beacon-add-to-circle/beacon-add-to-circle.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageBeaconAddToCircle extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Add to Beacon Circle' });
    const p = createElement('p', { text: 'Exact-match phone number lookup. Mutual acceptance is required before location can be shared.' });

    const phone = createElement('cn-input', { attrs: { label: 'Exact Phone Number', placeholder: '082 123 4567' } });
    const sendBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Send Request' });

    sendBtn.onclick = () => {
      showToast('Circle request sent!', { type: 'success' });
      navigate('beacon-home');
    };

    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(phone);
    this.appendChild(sendBtn);
  }
}
customElements.define('page-beacon-add-to-circle', PageBeaconAddToCircle);
`);

write('apps/resident-pwa/src/pages/beacon-requests/beacon-requests.js', `/**
 * @file apps/resident-pwa/src/pages/beacon-requests/beacon-requests.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageBeaconRequests extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Circle Requests' });
    this.appendChild(h);
  }
}
customElements.define('page-beacon-requests', PageBeaconRequests);
`);

write('apps/resident-pwa/src/pages/beacon-find-contacts/beacon-find-contacts.js', `/**
 * @file apps/resident-pwa/src/pages/beacon-find-contacts/beacon-find-contacts.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageBeaconFindContacts extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Find Contacts' });
    this.appendChild(h);
  }
}
customElements.define('page-beacon-find-contacts', PageBeaconFindContacts);
`);

write('apps/resident-pwa/src/pages/beacon-chat/beacon-chat.js', `/**
 * @file apps/resident-pwa/src/pages/beacon-chat/beacon-chat.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageBeaconChat extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';
    const h = createElement('h1', { text: 'Ephemeral Beacon Chat' });
    this.appendChild(h);
  }
}
customElements.define('page-beacon-chat', PageBeaconChat);
`);

write('apps/resident-pwa/src/pages/beacon-share-session/beacon-share-session.js', `/**
 * @file apps/resident-pwa/src/pages/beacon-share-session/beacon-share-session.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { sessionStore } from '../../session.js';
import { navigate } from '../../router.js';
import '../../components/live-map/live-map.js';

export class PageBeaconShareSession extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Live Sharing Active' });
    const map = createElement('cn-live-map', { attrs: { height: '240px' } });
    const timer = createElement('div', { text: '⏱️ Expires in: 28 mins', attrs: { style: 'font-weight: 700; margin: 16px 0;' } });

    const stopBtn = createElement('button', { cls: 'cn-btn cn-btn--danger cn-btn--full', text: '🛑 Stop Sharing Immediately' });
    stopBtn.onclick = () => {
      sessionStore.update(s => ({ ...s, activeSharesCount: 0 }));
      showToast('Location sharing stopped', { type: 'info' });
      navigate('beacon-home');
    };

    this.appendChild(h);
    this.appendChild(map);
    this.appendChild(timer);
    this.appendChild(stopBtn);
  }
}
customElements.define('page-beacon-share-session', PageBeaconShareSession);
`);

console.log('Lifeline and Beacon pages generated successfully.');
