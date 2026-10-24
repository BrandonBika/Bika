import { PLATFORM_ROLES } from '../../config.js';

export function createTopbar({ role, fullName, onSignOut }) {
  const header = document.createElement('header');
  header.className = 'dash-topbar';

  const search = document.createElement('label');
  search.className = 'topbar-search';
  const searchIcon = document.createElement('span');
  searchIcon.className = 'search-icon';
  searchIcon.setAttribute('aria-hidden', 'true');
  searchIcon.textContent = '⌕';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.name = 'dashboard-search';
  searchInput.placeholder = 'Search';
  searchInput.setAttribute('aria-label', 'Search dashboard');
  searchInput.disabled = true;
  search.append(searchIcon, searchInput);

  const actions = document.createElement('div');
  actions.className = 'topbar-actions';
  const notifications = document.createElement('button');
  notifications.type = 'button';
  notifications.className = 'icon-button';
  notifications.setAttribute('aria-label', 'Notifications are not available yet');
  notifications.title = 'Notifications are not available yet';
  notifications.disabled = true;
  notifications.append(createBellIcon());

  const menuWrap = document.createElement('div');
  menuWrap.className = 'user-menu-wrap';
  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'topbar-user';
  menuButton.setAttribute('aria-haspopup', 'true');
  menuButton.setAttribute('aria-expanded', 'false');
  const avatar = document.createElement('span');
  avatar.className = 'dash-avatar topbar-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = initials(fullName, role);
  const displayName = document.createElement('span');
  displayName.className = 'topbar-display-name';
  displayName.textContent = fullName || 'Platform staff';
  const chevron = document.createElement('span');
  chevron.className = 'user-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '⌄';
  menuButton.append(avatar, displayName, chevron);

  const menu = document.createElement('div');
  menu.className = 'user-menu';
  menu.hidden = true;
  const roleLabel = document.createElement('p');
  roleLabel.className = 'user-menu-role';
  roleLabel.textContent = role === PLATFORM_ROLES.ADMIN ? 'Platform Admin' : 'Platform Employee';
  const signOutButton = document.createElement('button');
  signOutButton.type = 'button';
  signOutButton.className = 'user-menu-signout';
  signOutButton.textContent = 'Sign out';
  signOutButton.addEventListener('click', onSignOut);
  menu.append(roleLabel, signOutButton);
  menuButton.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    menuButton.setAttribute('aria-expanded', String(!menu.hidden));
  });
  menuWrap.append(menuButton, menu);
  actions.append(notifications, menuWrap);
  header.append(search, actions);
  return header;
}

function createBellIcon() {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4');
  svg.append(path);
  return svg;
}

function initials(fullName, role) {
  if (fullName) {
    return fullName.split(/\s+/).filter(Boolean).slice(0, 2)
      .map((part) => part[0].toLocaleUpperCase()).join('');
  }
  return role === PLATFORM_ROLES.ADMIN ? 'PA' : 'PE';
}