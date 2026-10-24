import { NAVIGATION, PLATFORM_ROLES } from '../../config.js';
import { setSafeText } from '../../features/safe-dom.js';

const RAIL_COLLAPSED_KEY = 'civicneuro-platform-rail-collapsed';

const iconPaths = {
  'brand-shield': ['M12 2 20 5v6c0 5.3-3.4 9-8 11-4.6-2-8-5.7-8-11V5z', 'm8.5 12 2.2 2.2 4.8-5'],
  'rail-chevron': ['M15 18l-6-6 6-6'],
  dashboard: ['M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z', 'M9 3v15', 'M15 6v15'],
  'report-sheet': ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h8'],
  posts: ['M22 2 11 13', 'M22 2 15 22 11 13 2 9z'],
  chat: ['M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z'],
  surveys: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M3 21v-2a6 6 0 0 1 12 0v2z', 'M16 3.2a4 4 0 0 1 0 7.6', 'M19 15a5 5 0 0 1 2 4v2'],
  analytics: ['M4 20V10', 'M12 20V4', 'M20 20v-7'],
  'manage-profiles': ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2z', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M20 8v6', 'M17 11h6'],
  'export-data': ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  'my-profile': ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2z', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  'organisation-approvals': ['M3 21h18', 'M5 21V7l7-4 7 4v14', 'M9 21v-6h6v6', 'M9 10h.01', 'M15 10h.01'],
  'pilot-mode': ['M12 2 4 5v6c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5z', 'm9 12 2 2 4-4'],
  'platform-activity': ['M3 12h4l3-8 4 16 3-8h4'],
  'system-settings': ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.6-1l-.2.1-2.9-1.7.1-.2a1.7 1.7 0 0 0-.3-1.9l-.1-.1v-3.4l.2-.1a1.7 1.7 0 0 0 1-1.6l-.1-.2 1.7-2.9.2.1a1.7 1.7 0 0 0 1.9-.3l.1-.1h3.4l.1.2a1.7 1.7 0 0 0 1.6 1l.2-.1 2.9 1.7-.1.2a1.7 1.7 0 0 0 .3 1.9l.1.1v3.4z'],
  'platform-team': ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2z', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M20 8v6', 'M17 11h6']
};

function createIcon(name, extraClass = '') {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (extraClass) svg.setAttribute('class', extraClass);
  for (const pathData of iconPaths[name] ?? []) {
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', pathData);
    svg.append(path);
  }
  return svg;
}

export function createSidebar({ role, activeRoute, onNavigate, fullName }) {
  const rail = document.createElement('aside');
  rail.className = 'dash-rail';
  rail.dataset.collapsed = String(readCollapsedState());
  const brand = document.createElement('a');
  brand.className = 'dash-brand';
  brand.href = NAVIGATION[role]?.some((item) => item.id === 'dashboard' && item.enabled)
    ? '#/dashboard'
    : '#/home';
  brand.setAttribute('aria-label', 'CivicNeuro Platform dashboard');
  const mark = document.createElement('span');
  mark.className = 'dash-brand-mark';
  mark.append(createIcon('brand-shield', 'brand-shield'));
  const brandName = document.createElement('span');
  brandName.className = 'dash-brand-name';
  setSafeText(brandName, 'CivicNeuro');
  brand.append(mark, brandName);

  const railToggle = document.createElement('button');
  railToggle.type = 'button';
  railToggle.className = 'rail-toggle';
  railToggle.setAttribute('aria-controls', 'platform-navigation');
  railToggle.append(createIcon('rail-chevron', 'rail-toggle-icon'));
  updateToggleLabel(railToggle, readCollapsedState());
  railToggle.addEventListener('click', () => {
    const layout = rail.closest('.dash');
    if (!layout) return;
    const collapsed = rail.dataset.collapsed !== 'true';
    layout.classList.toggle('collapsed', collapsed);
    rail.dataset.collapsed = String(collapsed);
    updateToggleLabel(railToggle, collapsed);
    try {
      window.localStorage.setItem(RAIL_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Keep the current in-memory state when storage is unavailable.
    }
  });
  rail.addEventListener('transitionend', (event) => {
    if (event.target !== rail || event.propertyName !== 'width') return;
    rail.closest('.dash')?.dispatchEvent(new Event('platform-rail-resized'));
  });

  const nav = document.createElement('nav');
  nav.className = 'dash-nav';
  nav.id = 'platform-navigation';
  nav.setAttribute('aria-label', 'Platform navigation');
  for (const item of NAVIGATION[role] ?? []) {
    if (!item.enabled) continue;
    const link = document.createElement('a');
    link.className = 'n-item';
    link.href = `#${item.path}`;
    link.dataset.route = item.id;
    link.title = item.label;
    link.append(createIcon(item.id));
    const label = document.createElement('span');
    label.className = 'label';
    setSafeText(label, item.label);
    link.append(label);
    if (item.id === activeRoute) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
    link.addEventListener('click', (event) => {
      event.preventDefault();
      onNavigate(item.id);
    });
    nav.append(link);
  }

  const footer = document.createElement('div');
  footer.className = 'dash-rail-foot';
  const avatar = document.createElement('span');
  avatar.className = 'dash-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = initials(fullName, role);
  const identity = document.createElement('span');
  identity.className = 'dash-rail-identity';
  const name = document.createElement('span');
  name.className = 'dash-rail-name';
  name.textContent = fullName || 'Platform staff';
  const roleName = document.createElement('span');
  roleName.className = 'dash-rail-role';
  roleName.textContent = role === PLATFORM_ROLES.ADMIN ? 'Platform Admin' : 'Platform Employee';
  identity.append(name, roleName);
  footer.append(avatar, identity);
  rail.append(brand, railToggle, nav, footer);
  queueMicrotask(() => {
    rail.closest('.dash')?.classList.toggle('collapsed', rail.dataset.collapsed === 'true');
  });
  return rail;
}

function readCollapsedState() {
  try {
    return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function updateToggleLabel(button, collapsed) {
  const label = collapsed ? 'Expand side navigation' : 'Collapse side navigation';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.setAttribute('aria-expanded', String(!collapsed));
}

function initials(fullName, role) {
  if (fullName) {
    return fullName.split(/\s+/).filter(Boolean).slice(0, 2)
      .map((part) => part[0].toLocaleUpperCase()).join('');
  }
  return role === PLATFORM_ROLES.ADMIN ? 'PA' : 'PE';
}