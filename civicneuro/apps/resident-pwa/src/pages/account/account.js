/**
 * @file apps/resident-pwa/src/pages/account/account.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { sessionStore } from '../../session.js';
import { navigate } from '../../router.js';
import '../../components/back-button/back-button.js';

function createRow({ label, value, icon = '•', clickRoute, type = 'value' }) {
  const row = createElement('button', {
    cls: ['cn-account-row', type === 'toggle' ? 'cn-account-row--toggle' : ''],
    attrs: { type: 'button' }
  });

  const iconTile = createElement('span', { cls: 'cn-account-row__icon', text: icon, attrs: { 'aria-hidden': 'true' } });
  const text = createElement('span', { cls: 'cn-account-row__text' });
  text.appendChild(createElement('span', { cls: 'cn-account-row__label', text: label }));
  if (value) {
    text.appendChild(createElement('span', { cls: 'cn-account-row__value', text: value }));
  }
  row.append(iconTile, text);

  if (clickRoute) {
    row.addEventListener('click', () => navigate(clickRoute));
  }

  if (type === 'toggle') {
    const toggle = createElement('span', {
      cls: 'cn-account-switch',
      attrs: { 'aria-label': `${label} toggle`, 'role': 'switch', 'aria-checked': 'true' }
    });
    row.append(toggle);
  } else {
    row.append(createElement('span', { cls: 'cn-account-row__chevron', text: '›', attrs: { 'aria-hidden': 'true' } }));
  }

  return row;
}

export class PageAccount extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-account-page');
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'menu' } }));

    const session = sessionStore.get();
    const user = session.user || {
      fullName: 'Kagiso Ndlovu',
      phone: '082 345 6721',
      email: 'kagiso.ndlovu@email.com',
      ward: 'Ward 12'
    };

    const initials = (user.fullName || 'Kagiso Ndlovu')
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();

    const header = createElement('div', { cls: 'cn-account-head' });
    const avatar = createElement('div', {
      cls: 'cn-account-avatar',
      text: initials,
      attrs: { 'aria-hidden': 'true' }
    });
    const name = createElement('h1', { cls: 'cn-account-name', text: user.fullName });
    const meta = createElement('p', { cls: 'cn-account-meta', text: 'Resident since Mar 2024 · Ward 12' });

    const badgeRow = createElement('div', { cls: 'cn-account-badges' });
    ['Neighbourhood Watch', 'Water Watcher', 'Spotter'].forEach((badge) => {
      badgeRow.appendChild(createElement('span', { cls: 'cn-account-badge', text: badge }));
    });

    const badgesLink = createElement('button', {
      cls: 'cn-account-link',
      text: '+ Edit community badges',
      attrs: { type: 'button' }
    });
    badgesLink.addEventListener('click', () => navigate('badges-edit'));

    const editPill = createElement('button', {
      cls: 'cn-account-pill',
      text: 'Edit profile',
      attrs: { type: 'button' }
    });
    editPill.addEventListener('click', () => navigate('profile-edit'));

    header.append(avatar, name, meta, badgeRow, badgesLink, editPill);
    this.appendChild(header);

    const stats = createElement('div', { cls: 'cn-account-stats' });
    [
      { label: 'Reports submitted', value: '7' },
      { label: 'Reports resolved', value: '4' },
      { label: 'Reports active', value: '3' }
    ].forEach((stat) => {
      const tile = createElement('div', { cls: 'cn-account-stat' });
      const value = createElement('div', { cls: 'cn-account-stat__value', text: stat.value });
      const label = createElement('div', { cls: 'cn-account-stat__label', text: stat.label });
      tile.append(value, label);
      stats.appendChild(tile);
    });
    this.appendChild(stats);

    const contactSection = createElement('section', { cls: 'cn-account-section' });
    contactSection.appendChild(createElement('h2', { cls: 'cn-account-section__title', text: 'CONTACT DETAILS' }));
    const contactList = createElement('div', { cls: 'cn-account-list' });
    contactList.append(
      createRow({ label: 'Phone', value: user.phone, icon: '☎', clickRoute: 'profile-edit' }),
      createRow({ label: 'Email', value: user.email, icon: '✉', clickRoute: 'profile-edit' }),
      createRow({ label: 'Address', value: user.address || '', icon: '⌂', clickRoute: 'profile-edit' })
    );
    contactSection.appendChild(contactList);
    this.appendChild(contactSection);

    const prefsSection = createElement('section', { cls: 'cn-account-section' });
    prefsSection.appendChild(createElement('h2', { cls: 'cn-account-section__title', text: 'PREFERENCES' }));
    const prefList = createElement('div', { cls: 'cn-account-list' });
    prefList.append(
      createRow({ label: 'Push notifications', value: '', icon: '◍', type: 'toggle' }),
      createRow({ label: 'SMS updates', value: '', icon: '⌁', type: 'toggle' }),
      createRow({ label: 'Notify me about', value: 'Ward 12 only', icon: '◔', clickRoute: 'notification-settings' }),
      createRow({ label: 'Language', value: 'English', icon: '文', clickRoute: 'language' }),
      createRow({ label: 'Terms & conditions', value: '', icon: '§', clickRoute: 'terms' })
    );
    prefsSection.appendChild(prefList);
    this.appendChild(prefsSection);

    const actions = createElement('div', { cls: 'cn-account-actions' });
    const privacyBtn = createElement('button', { cls: 'cn-account-action', text: 'Privacy policy', attrs: { type: 'button' } });
    privacyBtn.addEventListener('click', () => navigate('privacy-policy'));

    const deleteBtn = createElement('button', { cls: 'cn-account-action cn-account-action--danger', text: 'Delete account', attrs: { type: 'button' } });
    deleteBtn.addEventListener('click', () => navigate('delete-account'));

    actions.append(privacyBtn, deleteBtn);
    this.appendChild(actions);
  }
}
customElements.define('page-account', PageAccount);
