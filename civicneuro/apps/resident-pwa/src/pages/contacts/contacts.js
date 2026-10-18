/**
 * @file apps/resident-pwa/src/pages/contacts/contacts.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/back-button/back-button.js';

const departments = [
  { name: 'Municipal Switchboard', hours: 'Mon–Fri, 07:30–16:00', phone: '+27310000000', email: 'switchboard@etown.gov.za' },
  { name: 'Roads & Transport', hours: 'Mon–Fri, 07:00–17:00', phone: '+27310000001', email: 'roads@etown.gov.za' },
  { name: 'Water & Sanitation', hours: '24-hour emergency line', phone: '+27310000002', email: 'water@etown.gov.za' },
  { name: 'Electricity', hours: '24-hour fault line', phone: '+27310000003', email: 'electricity@etown.gov.za' }
];

function createDepartmentCard(department) {
  const card = createElement('article', { cls: 'cn-department-card' });
  const top = createElement('div', { cls: 'cn-department-top' });
  const icon = createElement('span', { cls: 'cn-department-icon', text: '⌂', attrs: { 'aria-hidden': 'true' } });
  const titleWrap = createElement('div', { cls: 'cn-department-meta' });
  titleWrap.append(
    createElement('div', { cls: 'cn-department-name', text: department.name }),
    createElement('div', { cls: 'cn-department-hours', text: department.hours })
  );
  top.append(icon, titleWrap);

  const actions = createElement('div', { cls: 'cn-department-actions' });
  const callBtn = createElement('a', {
    cls: 'cn-department-action cn-department-action--primary',
    text: 'Call',
    attrs: { href: `tel:${department.phone}` }
  });
  callBtn.prepend(createElement('span', { cls: 'cn-department-action__icon', text: '☎', attrs: { 'aria-hidden': 'true' } }));

  const emailBtn = createElement('a', {
    cls: 'cn-department-action',
    text: 'Email',
    attrs: { href: `mailto:${department.email}` }
  });
  emailBtn.prepend(createElement('span', { cls: 'cn-department-action__icon', text: '✉', attrs: { 'aria-hidden': 'true' } }));

  if (!department.email) {
    emailBtn.style.display = 'none';
  }

  actions.append(callBtn, emailBtn);
  card.append(top, actions);
  return card;
}

export class PageContacts extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-contacts-page');
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'menu' } }));

    this.appendChild(createElement('h1', { cls: 'cn-contacts-title', text: 'Contacts' }));

    const searchWrap = createElement('label', { cls: 'cn-contacts-search' });
    const icon = createElement('span', { cls: 'cn-contacts-search__icon', text: '⌕', attrs: { 'aria-hidden': 'true' } });
    const input = createElement('input', {
      cls: 'cn-contacts-input',
      attrs: { type: 'search', placeholder: 'Search departments…', 'aria-label': 'Search departments' }
    });
    searchWrap.append(icon, input);
    this.appendChild(searchWrap);

    const list = createElement('div', { cls: 'cn-department-list' });
    departments.forEach((department) => list.appendChild(createDepartmentCard(department)));
    this.appendChild(list);

    input.addEventListener('input', (event) => {
      const query = event.target.value.trim().toLowerCase();
      list.querySelectorAll('.cn-department-card').forEach((card) => {
        const name = card.querySelector('.cn-department-name')?.textContent?.toLowerCase() || '';
        card.style.display = name.includes(query) ? '' : 'none';
      });
    });
  }
}
customElements.define('page-contacts', PageContacts);
