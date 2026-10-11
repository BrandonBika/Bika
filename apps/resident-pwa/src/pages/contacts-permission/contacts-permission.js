/**
 * @file apps/resident-pwa/src/pages/contacts-permission/contacts-permission.js
 * Shared Contacts Permission Flow (Screen E, Screen F, and Screen H).
 * Shared between Beacon and Lifeline.
 */

import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { BeaconIcons } from '../../features/beacon/beacon-icons.js';
import {
  getContactsPermissionStatus,
  setContactsPermissionStatus
} from '../../features/beacon/beacon.client.js';
import { navigate } from '../../router.js';

export class PageContactsPermission extends BaseElement {
  init(params) {
    this._params = params || {};
    this._source = this._params.source === 'lifeline' ? 'lifeline' : 'beacon';
    this._viewState = this._params.state === 'denied' ? 'denied' : 'explainer';
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-contacts-permission-page');

    if (this._source === 'beacon') {
      navigate('beacon-find-contacts');
      return;
    }

    // If permission was already denied, start in denied view
    if (getContactsPermissionStatus() === 'denied') {
      this._viewState = 'denied';
    }

    this.render();
  }

  returnToSource() {
    if (this._source === 'beacon') {
      navigate('beacon-add-to-circle');
    } else {
      navigate('lifeline-home');
    }
  }

  render() {
    clearChildren(this);

    if (this._viewState === 'denied') {
      this.renderDeniedView();
    } else {
      this.renderExplainerView();
    }
  }

  renderExplainerView() {
    const wrap = createElement('div', { cls: 'perm-content-wrap' });

    // Hero
    const hero = createElement('div', { cls: 'sh-hero' });
    hero.appendChild(BeaconIcons.contacts(26, '#185FA5'));

    const title = createElement('div', { cls: 'sh-title', text: 'Use your contacts?' });
    const sub = createElement('div', {
      cls: 'sh-sub',
      text: 'One quick permission covers both features — we only ask once.'
    });

    // Lifeline card
    const llCard = createElement('div', { cls: 'sh-use-card' });
    const llIc = createElement('div', { cls: ['u-ic', 'll'] });
    llIc.appendChild(BeaconIcons.phone(16, '#B03060'));
    const llText = createElement('div');
    const llT = createElement('div', { cls: 'u-t', text: 'Lifeline' });
    const llD = createElement('div', {
      cls: 'u-d',
      text: 'Pick the people who get called when you tap Crime, Fire, Sickness, GBV or your own card.'
    });
    llText.append(llT, llD);
    llCard.append(llIc, llText);

    // Beacon card
    const bcCard = createElement('div', { cls: 'sh-use-card' });
    const bcIc = createElement('div', { cls: ['u-ic', 'bc'] });
    bcIc.appendChild(BeaconIcons.pin(16, '#1C8C99'));
    const bcText = createElement('div');
    const bcT = createElement('div', { cls: 'u-t', text: 'Beacon' });
    const bcD = createElement('div', {
      cls: 'u-d',
      text: 'Find friends and family already on CivicNeuro and add them to your circle.'
    });
    bcText.append(bcT, bcD);
    bcCard.append(bcIc, bcText);

    // Privacy note
    const privacy = createElement('div', { cls: 'sh-privacy-note' });
    privacy.appendChild(BeaconIcons.lock(14, '#7A6A1F'));
    const privacyText = createElement('div', {
      cls: 't',
      text: 'Only people you add to a card or send a Beacon request to are saved. You can switch this off any time in your phone’s Settings.'
    });
    privacy.appendChild(privacyText);

    wrap.append(hero, title, sub, llCard, bcCard, privacy);
    this.appendChild(wrap);

    // Bottom buttons
    const btnArea = createElement('div', { cls: 'perm-btn-area' });
    const continueBtn = createElement('button', {
      cls: 'perm-btn-continue',
      attrs: { type: 'button', id: 'perm-continue-btn' },
      text: 'Continue'
    });
    continueBtn.onclick = () => this.showOsDialog();

    const notNowBtn = createElement('button', {
      cls: 'perm-btn-notnow',
      attrs: { type: 'button', id: 'perm-not-now-btn' },
      text: 'Not now'
    });
    notNowBtn.onclick = () => this.returnToSource();

    btnArea.append(continueBtn, notNowBtn);
    this.appendChild(btnArea);
  }

  showOsDialog() {
    const backdrop = createElement('div', {
      cls: ['modal-backdrop', 'perm-backdrop'],
      attrs: { id: 'os-prompt-dialog', role: 'dialog', 'aria-modal': 'true' }
    });

    const dialog = createElement('div', { cls: ['dialog', 'perm-dialog'] });
    const icon = createElement('div', { cls: ['dialog-icon', 'blue'] });
    icon.appendChild(BeaconIcons.contacts(22, '#185FA5'));

    const title = createElement('div', { cls: 'perm-dialog-title', text: 'Allow access to contacts?' });
    const body = createElement('div', {
      cls: 'perm-dialog-body',
      text: 'CivicNeuro uses your contacts for Lifeline and Beacon. Native OS permission prompt — asked once for the whole app.'
    });

    const btnRow = createElement('div', { cls: 'btn-row' });
    const denyBtn = createElement('button', {
      cls: ['btn-flat', 'ghost'],
      attrs: { type: 'button', id: 'os-deny-btn' },
      text: "Don't allow"
    });
    denyBtn.onclick = () => {
      backdrop.remove();
      setContactsPermissionStatus('denied');
      this._viewState = 'denied';
      this.render();
    };

    const allowBtn = createElement('button', {
      cls: ['btn-flat', 'primary'],
      attrs: { type: 'button', id: 'os-allow-btn' },
      text: 'Allow'
    });
    allowBtn.onclick = () => {
      backdrop.remove();
      setContactsPermissionStatus('granted');
      navigate('beacon-find-contacts');
    };

    btnRow.append(denyBtn, allowBtn);
    dialog.append(icon, title, body, btnRow);
    backdrop.appendChild(dialog);
    this.appendChild(backdrop);
  }

  renderDeniedView() {
    const wrap = createElement('div', { cls: 'perm-content-wrap' });
    const content = createElement('div', { cls: 'denied-content' });

    const icon = createElement('div', { cls: 'denied-icon' });
    icon.appendChild(BeaconIcons.warning(24, 'var(--amber, #BA7517)'));

    const title = createElement('div', { cls: 'denied-title', text: 'Contacts access is off' });

    const body = createElement('div', { cls: 'denied-body' });
    const t1 = document.createTextNode('You can still ');
    const b1 = createElement('b', { text: 'type numbers' });
    const t2 = document.createTextNode(' on a Lifeline card, or ');
    const b2 = createElement('b', { text: 'search by name or number' });
    const t3 = document.createTextNode(" in Beacon. To pick from your contacts, switch access on in your phone's Settings.");
    body.append(t1, b1, t2, b2, t3);

    content.append(icon, title, body);
    wrap.appendChild(content);
    this.appendChild(wrap);

    const btnArea = createElement('div', { cls: 'perm-btn-area' });
    const settingsBtn = createElement('button', {
      cls: 'perm-btn-continue',
      attrs: { type: 'button', id: 'perm-open-settings-btn' },
      text: 'Open Settings'
    });
    settingsBtn.onclick = () => {
      setContactsPermissionStatus('granted');
      showToast('Settings simulated: contacts permission switched on', { type: 'success' });
      navigate('beacon-find-contacts');
    };

    const continueBtn = createElement('button', {
      cls: 'perm-btn-notnow',
      attrs: { type: 'button', id: 'perm-continue-without-btn' },
      text: 'Continue without contacts'
    });
    continueBtn.onclick = () => this.returnToSource();

    btnArea.append(settingsBtn, continueBtn);
    this.appendChild(btnArea);
  }
}
customElements.define('page-contacts-permission', PageContactsPermission);
