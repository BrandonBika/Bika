import { NAVIGATION } from '../../config.js';
import { navigate } from '../../router.js';

const RAIL_KEY = 'bika-org-rail-collapsed';

function readCollapsed() {
  try {
    return window.localStorage.getItem(RAIL_KEY) === 'true';
  } catch {
    return false;
  }
}

export function createSidebar(context, activeRoute) {
  const rail = document.createElement('aside');
  rail.className = 'dash-rail org-rail';
  rail.dataset.collapsed = String(readCollapsed());
  const brand = document.createElement('a');
  brand.className = 'dash-brand';
  brand.href = '#/dashboard';
  const logo = document.createElement('img');
  logo.className = 'dash-brand-mark';
  logo.src = '/landing/assets/bika-logo.png';
  logo.alt = 'Bika logo';
  const name = document.createElement('span');
  name.className = 'dash-brand-name';
  name.textContent = 'Bika';
  brand.append(logo, name);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'rail-toggle';
  toggle.textContent = '‹';
  toggle.setAttribute('aria-label', 'Collapse side navigation');
  toggle.addEventListener('click', () => {
    const collapsed = rail.dataset.collapsed !== 'true';
    rail.dataset.collapsed = String(collapsed);
    rail.closest('.dash')?.classList.toggle('collapsed', collapsed);
    toggle.setAttribute('aria-label', collapsed ? 'Expand side navigation' : 'Collapse side navigation');
    try {
      window.localStorage.setItem(RAIL_KEY, String(collapsed));
    } catch {
      rail.dataset.collapsed = String(collapsed);
    }
  });

  const nav = document.createElement('nav');
  nav.className = 'dash-nav';
  nav.setAttribute('aria-label', 'Organisation navigation');
  for (const item of NAVIGATION[context.role]) {
    const link = document.createElement('a');
    link.className = 'n-item';
    link.href = `#/${item.id}`;
    link.title = item.label;
    link.dataset.route = item.id;
    link.textContent = item.label;
    if (item.id === activeRoute) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
    link.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(item.id);
    });
    nav.append(link);
  }

  const footer = document.createElement('div');
  footer.className = 'dash-rail-foot';
  const identity = document.createElement('span');
  identity.className = 'dash-rail-identity';
  const fullName = document.createElement('span');
  fullName.className = 'dash-rail-name';
  fullName.textContent = context.fullName || context.email || 'Organisation member';
  const role = document.createElement('span');
  role.className = 'dash-rail-role';
  role.textContent = context.role === 'org_admin' ? 'Organisation Admin' : 'Organisation Employee';
  identity.append(fullName, role);
  footer.append(identity);
  rail.append(brand, toggle, nav, footer);
  queueMicrotask(() => {
    rail.closest('.dash')?.classList.toggle('collapsed', rail.dataset.collapsed === 'true');
  });
  return rail;
}