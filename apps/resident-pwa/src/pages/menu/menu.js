/**
 * @file apps/resident-pwa/src/pages/menu/menu.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { signOut } from '../../features/auth/auth.client.js';
import { sessionStore } from '../../session.js';
import '../../components/confirm-dialog/confirm-dialog.js';

const communityItems = [
  { label: 'Load shedding schedule', icon: '◷', tone: 'sage', route: 'load-shedding-schedule' },
  { label: 'Help & FAQs', icon: '?', tone: 'sage', route: 'help-and-safety' }
];

const accountItems = [
  { label: 'Language', icon: '文', tone: 'sage', route: 'language' },
  { label: 'Settings', icon: '⚙', tone: 'sage', route: 'settings' },
  { label: 'Privacy policy', icon: '▤', tone: 'sage', route: 'privacy-policy' }
];

function createMenuRow(item) {
  const row = createElement('button', {
    cls: 'cn-menu-row',
    attrs: { type: 'button' }
  });

  const icon = createElement('span', {
    cls: `cn-menu-row__icon cn-menu-row__icon--${item.tone}`,
    text: item.icon,
    attrs: { 'aria-hidden': 'true' }
  });

  const label = createElement('span', { cls: 'cn-menu-row__label', text: item.label });
  const arrow = createElement('span', {
    cls: 'cn-menu-row__arrow',
    text: '›',
    attrs: { 'aria-hidden': 'true' }
  });

  row.append(icon, label, arrow);
  row.addEventListener('click', () => navigate(item.route));
  return row;
}

function createMenuSection(title, items) {
  const section = createElement('section', { cls: 'cn-menu-section' });
  section.appendChild(createElement('h2', {
    cls: 'cn-menu-section__title',
    text: title
  }));

  const list = createElement('div', { cls: 'cn-menu-list' });
  for (const item of items) list.appendChild(createMenuRow(item));
  section.appendChild(list);
  return section;
}

export class PageMenu extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-menu-page');

    const { isGuest, user } = sessionStore.get();
    const fullName = user?.fullName || (isGuest ? 'Guest Resident' : 'Kagiso Ndlovu');
    const wardText = user?.ward || 'Ward 12';
    const initials = fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || 'R';

    this.appendChild(createElement('h1', { cls: 'cn-menu-title', text: 'Menu' }));

    const profile = createElement('button', {
      cls: 'cn-menu-profile',
      attrs: { type: 'button', 'aria-label': `${fullName}, resident, ${wardText}, opens profile` }
    });

    profile.appendChild(createElement('span', {
      cls: 'cn-menu-profile__avatar',
      text: initials,
      attrs: { 'aria-hidden': 'true' }
    }));

    const profileText = createElement('span', { cls: 'cn-menu-profile__text' });
    profileText.append(
      createElement('span', { cls: 'cn-menu-profile__name', text: fullName }),
      createElement('span', {
        cls: 'cn-menu-profile__meta',
        text: `${isGuest ? 'Guest' : 'Resident'} · ${wardText}`
      })
    );

    profile.append(
      profileText,
      createElement('span', {
        cls: 'cn-menu-profile__arrow',
        text: '›',
        attrs: { 'aria-hidden': 'true' }
      })
    );
    profile.addEventListener('click', () => navigate(isGuest ? 'welcome' : 'account'));
    this.appendChild(profile);

    this.append(
      createMenuSection('COMMUNITY', communityItems),
      createMenuSection('ACCOUNT', accountItems)
    );

    const signOutButton = createElement('button', {
      cls: 'cn-menu-signout',
      text: 'Sign out',
      attrs: { type: 'button' }
    });
    signOutButton.addEventListener('click', () => {
      const ConfirmDialog = customElements.get('cn-confirm-dialog');
      if (!ConfirmDialog) {
        throw new Error('Sign-out confirmation dialog is unavailable.');
      }
      ConfirmDialog.show({
        title: 'Sign out?',
        message: "You'll need to sign in again to see your reports, alerts, and badges.",
        confirmText: 'Sign out',
        danger: true,
        onConfirm: async () => {
          try {
            await signOut();
          } finally {
            navigate('welcome', {}, { replace: true });
          }
        }
      });
    });
    this.appendChild(signOutButton);

    this.appendChild(createElement('p', {
      cls: 'cn-menu-version',
      text: 'CivicNeuro Resident App · v2.4.1'
    }));
  }
}
customElements.define('page-menu', PageMenu);
